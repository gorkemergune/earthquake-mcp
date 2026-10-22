import { describe, expect, it, vi } from 'vitest';
import { AfadClient, parseRetryAfter, parseSnapshotBody, type FetchFn } from '../../src/afad/client.ts';
import { AFAD_EVENT_FILTER_URL } from '../../src/config.ts';
import { AfadError } from '../../src/utils/errors.ts';
import { jsonResponse, loadFixture, rawEvent } from '../helpers.ts';

function sequenceFetch(...steps: Array<() => Promise<Response> | Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn: FetchFn = async (url, init) => {
    calls.push({ url, init });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)]!;
    return step();
  };
  return { fn, calls };
}

function hangingFetch(): FetchFn {
  return (_url, init) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    });
}

const noSleep = vi.fn(async () => {});

async function expectAfadError(promise: Promise<unknown>, code: AfadError['code']): Promise<AfadError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(AfadError);
  expect((err as AfadError).code).toBe(code);
  return err as AfadError;
}

describe('parseSnapshotBody', () => {
  it('parses numeric strings, keeps eventID a string and accepts null location fields', () => {
    const { events, sourceRecordCount } = parseSnapshotBody(loadFixture());
    expect(sourceRecordCount).toBe(11);
    const offshore = events.find((e) => e.id === '900003')!;
    expect(offshore.province).toBeNull();
    expect(offshore.district).toBeNull();
    expect(offshore.magnitude).toBe(2.8);
    expect(offshore.depthKm).toBe(11.2);
    expect(offshore.date.toISOString()).toBe('2026-10-22T12:00:00.000Z');
    expect(events.find((e) => e.id === '900010')!.depthKm).toBeNull();
    expect(events.find((e) => e.id === '900009')!.province).toBeNull();
  });

  it('accepts numeric eventID and numbers and strips control characters from text', () => {
    const { events } = parseSnapshotBody([rawEvent({ eventID: 42, magnitude: 3, location: 'A\nB\u0000  C' })]);
    expect(events[0]!.id).toBe('42');
    expect(events[0]!.location).toBe('A B C');
  });

  it.each([
    ['non-array body', { error: 'x' }],
    ['HTML string', '<html>maintenance</html>'],
    ['missing eventID', [rawEvent({ eventID: undefined })]],
    ['empty eventID', [rawEvent({ eventID: '' })]],
    ['bad magnitude', [rawEvent({ magnitude: 'abc' })]],
    ['empty latitude', [rawEvent({ latitude: '' })]],
    ['latitude out of range', [rawEvent({ latitude: '123' })]],
    ['bad date', [rawEvent({ date: '2026-13-01T00:00:00' })]],
    ['bad depth', [rawEvent({ depth: 'deep' })]],
    ['one bad record among good ones', [rawEvent(), rawEvent({ eventID: '2', longitude: 'x' })]],
  ])('rejects %s as AFAD_INVALID_RESPONSE', (_name, body) => {
    expect(() => parseSnapshotBody(body)).toThrowError(expect.objectContaining({ code: 'AFAD_INVALID_RESPONSE' }));
  });

  it('accepts an empty array', () => {
    expect(parseSnapshotBody([])).toEqual({ sourceRecordCount: 0, events: [] });
  });
});

describe('AfadClient', () => {
  it('uses the fixed endpoint with explicit limit, orderby and format', async () => {
    const { fn, calls } = sequenceFetch(() => jsonResponse([rawEvent()]));
    const snapshot = await new AfadClient({ fetch: fn, sleep: noSleep }).fetchSnapshot();
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(`${url.origin}${url.pathname}`).toBe(AFAD_EVENT_FILTER_URL);
    expect(url.protocol).toBe('https:');
    expect(Object.fromEntries(url.searchParams)).toEqual({ limit: '1000', orderby: 'timedesc', format: 'json' });
    expect(calls[0]!.init.method).toBe('GET');
    expect(snapshot.sourceUrl).toBe(AFAD_EVENT_FILTER_URL);
    expect(snapshot.events).toHaveLength(1);
  });

  it('rejects out-of-range internal limits', () => {
    expect(() => AfadClient.buildUrl(0)).toThrow(RangeError);
    expect(() => AfadClient.buildUrl(1001)).toThrow(RangeError);
  });

  it('retries a 5xx once and succeeds', async () => {
    const sleep = vi.fn(async () => {});
    const { fn, calls } = sequenceFetch(
      () => new Response('oops', { status: 503 }),
      () => jsonResponse([rawEvent()]),
    );
    const snapshot = await new AfadClient({ fetch: fn, sleep, retryDelayMs: 7 }).fetchSnapshot();
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(7, undefined);
    expect(snapshot.events).toHaveLength(1);
  });

  it('stops after one retry on persistent 5xx', async () => {
    const { fn, calls } = sequenceFetch(() => new Response('<html>down</html>', { status: 502 }));
    const err = await expectAfadError(new AfadClient({ fetch: fn, sleep: noSleep }).fetchSnapshot(), 'AFAD_UNAVAILABLE');
    expect(calls).toHaveLength(2);
    expect(err.message).not.toContain('<html>');
  });

  it('honours a bounded Retry-After on 429 and reports AFAD_RATE_LIMITED when it persists', async () => {
    const sleep = vi.fn(async () => {});
    const { fn, calls } = sequenceFetch(() => new Response('', { status: 429, headers: { 'retry-after': '2' } }));
    await expectAfadError(new AfadClient({ fetch: fn, sleep }).fetchSnapshot(), 'AFAD_RATE_LIMITED');
    expect(calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(2000, undefined);
  });

  it('caps a large Retry-After', async () => {
    const sleep = vi.fn(async () => {});
    const { fn } = sequenceFetch(
      () => new Response('', { status: 429, headers: { 'retry-after': '3600' } }),
      () => jsonResponse([]),
    );
    await new AfadClient({ fetch: fn, sleep, maxRetryAfterMs: 5000 }).fetchSnapshot();
    expect(sleep).toHaveBeenCalledWith(5000, undefined);
  });

  it('does not retry other 4xx responses', async () => {
    const { fn, calls } = sequenceFetch(() => new Response('bad', { status: 400 }));
    await expectAfadError(new AfadClient({ fetch: fn, sleep: noSleep }).fetchSnapshot(), 'AFAD_UNAVAILABLE');
    expect(calls).toHaveLength(1);
  });

  it('does not retry invalid JSON', async () => {
    const { fn, calls } = sequenceFetch(() => new Response('<html>not json</html>', { status: 200 }));
    await expectAfadError(new AfadClient({ fetch: fn, sleep: noSleep }).fetchSnapshot(), 'AFAD_INVALID_RESPONSE');
    expect(calls).toHaveLength(1);
  });

  it('does not retry schema errors', async () => {
    const { fn, calls } = sequenceFetch(() => jsonResponse([rawEvent({ date: null })]));
    await expectAfadError(new AfadClient({ fetch: fn, sleep: noSleep }).fetchSnapshot(), 'AFAD_INVALID_RESPONSE');
    expect(calls).toHaveLength(1);
  });

  it('times out, retries once, then reports AFAD_TIMEOUT', async () => {
    let count = 0;
    const inner = hangingFetch();
    const fn: FetchFn = (url, init) => {
      count += 1;
      return inner(url, init);
    };
    await expectAfadError(new AfadClient({ fetch: fn, sleep: noSleep, timeoutMs: 20 }).fetchSnapshot(), 'AFAD_TIMEOUT');
    expect(count).toBe(2);
  });

  it('retries network errors once', async () => {
    const { fn, calls } = sequenceFetch(
      () => Promise.reject(new TypeError('fetch failed')),
      () => jsonResponse([]),
    );
    const snapshot = await new AfadClient({ fetch: fn, sleep: noSleep }).fetchSnapshot();
    expect(calls).toHaveLength(2);
    expect(snapshot.sourceRecordCount).toBe(0);
  });

  it('skips the retry when the total budget would be exceeded', async () => {
    let t = 0;
    const { fn, calls } = sequenceFetch(() => {
      t += 24_500;
      return new Response('', { status: 503 });
    });
    await expectAfadError(
      new AfadClient({ fetch: fn, sleep: noSleep, monotonicNow: () => t, totalBudgetMs: 25_000 }).fetchSnapshot(),
      'AFAD_UNAVAILABLE',
    );
    expect(calls).toHaveLength(1);
  });

  it('aborts without retry when the outer signal fires', async () => {
    const controller = new AbortController();
    let count = 0;
    const inner = hangingFetch();
    const fn: FetchFn = (url, init) => {
      count += 1;
      setTimeout(() => controller.abort(), 5);
      return inner(url, init);
    };
    await expectAfadError(
      new AfadClient({ fetch: fn, sleep: noSleep, timeoutMs: 5000 }).fetchSnapshot({ signal: controller.signal }),
      'AFAD_UNAVAILABLE',
    );
    expect(count).toBe(1);
  });
});

describe('parseRetryAfter', () => {
  it('parses seconds and HTTP dates', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('soon')).toBeUndefined();
    const now = Date.parse('2026-10-22T15:00:00Z');
    expect(parseRetryAfter('Thu, 22 Oct 2026 15:00:04 GMT', now)).toBe(4000);
  });
});
