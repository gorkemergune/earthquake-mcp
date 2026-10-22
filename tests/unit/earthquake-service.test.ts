import { describe, expect, it } from 'vitest';
import type { AfadSnapshotSource } from '../../src/afad/client.ts';
import { EarthquakeService } from '../../src/services/earthquake-service.ts';
import { AfadError } from '../../src/utils/errors.ts';
import { FIXTURE_NOW, loadFixture, rawEvent, snapshotFrom, staticSource } from '../helpers.ts';

const clock = () => new Date(FIXTURE_NOW);

function service(body: unknown = loadFixture()) {
  const source = staticSource(body);
  return { svc: new EarthquakeService({ source, clock }), source };
}

/** Builds `count` events one minute apart, newest at `newest`. */
function series(count: number, newest: Date, extra: (i: number) => Record<string, unknown> = () => ({})) {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(newest.getTime() - i * 60_000);
    return rawEvent({ eventID: String(100_000 + i), date: d.toISOString().slice(0, 19), ...extra(i) });
  });
}

describe('EarthquakeService.getLast24h', () => {
  it('includes both 24h boundaries and excludes events just outside', async () => {
    const { svc } = service();
    const result = await svc.getLast24h({ limit: 100 });
    const ids = result.earthquakes.map((e) => e.id);
    expect(result.requestedRange).toEqual({ startUtc: '2026-10-21T15:00:00Z', endUtc: '2026-10-22T15:00:00Z' });
    expect(ids).toContain('900001'); // exactly now
    expect(ids).toContain('900006'); // exactly now - 24h
    expect(ids).not.toContain('900007'); // 1 s before the window
    expect(ids).not.toContain('900008'); // two days old
  });

  it('sorts newest first and returns UTC plus Turkey time', async () => {
    const { svc } = service();
    const result = await svc.getLast24h({ limit: 100 });
    expect(result.earthquakes.map((e) => e.id)).toEqual([
      '900001', '900002', '900003', '900004', '900005', '900009', '900010', '900006',
    ]);
    expect(result.earthquakes[0]).toMatchObject({
      dateUtc: '2026-10-22T15:00:00Z',
      dateTurkey: '2026-10-22T18:00:00+03:00',
      province: 'İzmir',
    });
    expect(result.source).toBe('AFAD');
    expect(result.fetchedAtUtc).toBe('2026-10-22T15:00:00Z');
  });

  it('collapses an updated event ID into its newest version', async () => {
    const { svc } = service();
    const result = await svc.getLast24h({ limit: 100 });
    const matches = result.earthquakes.filter((e) => e.id === '900005');
    expect(matches).toHaveLength(1);
    expect(matches[0]!.magnitude).toBe(3.3);
    expect(result.sourceRecordCount).toBe(11);
  });

  it('filters by magnitude before applying the limit', async () => {
    const { svc } = service();
    const result = await svc.getLast24h({ limit: 2, minMagnitude: 2.8 });
    expect(result.matchedCount).toBe(4); // 3.4, 2.8, 3.3, 3.0
    expect(result.returnedCount).toBe(2);
    expect(result.truncatedByLimit).toBe(true);
    expect(result.earthquakes.map((e) => e.id)).toEqual(['900002', '900003']);
    expect(result.warnings.some((w) => w.includes('limit=2'))).toBe(true);
  });

  it('marks the window covered when the snapshot reaches back past the start', async () => {
    const { svc } = service();
    const result = await svc.getLast24h({ limit: 100 });
    expect(result.coverage).toMatchObject({
      status: 'covered',
      oldestAvailableUtc: '2026-10-20T08:00:00Z',
      latestAvailableUtc: '2026-10-22T15:00:00Z',
      sourceCap: 1000,
    });
    expect(result.warnings[0]).toContain('1000');
  });

  it('reports possibly_incomplete when 1000 records do not reach the start', async () => {
    const { svc } = service(series(1000, FIXTURE_NOW));
    const result = await svc.getLast24h({ limit: 5 });
    expect(result.sourceRecordCount).toBe(1000);
    expect(result.coverage.status).toBe('possibly_incomplete');
    expect(result.matchedCount).toBe(1000);
    expect(result.returnedCount).toBe(5);
    expect(result.truncatedByLimit).toBe(true);
  });

  it('reports unknown for a short snapshot that does not reach the start', async () => {
    const { svc } = service(series(10, FIXTURE_NOW));
    const result = await svc.getLast24h({ limit: 100 });
    expect(result.coverage.status).toBe('unknown');
  });

  it('reports unknown with null window for an empty snapshot and does not claim there were no quakes', async () => {
    const { svc } = service([]);
    const result = await svc.getLast24h({ limit: 100 });
    expect(result.coverage).toMatchObject({ status: 'unknown', oldestAvailableUtc: null, latestAvailableUtc: null });
    expect(result.matchedCount).toBe(0);
    expect(result.warnings.join(' ')).toContain('eşleşme bulunamadı');
  });

  it('propagates AFAD errors instead of returning an empty list', async () => {
    const source: AfadSnapshotSource = {
      fetchSnapshot: async () => {
        throw new AfadError('AFAD_UNAVAILABLE', 'HTTP 503');
      },
    };
    const svc = new EarthquakeService({ source, clock });
    await expect(svc.getLast24h({ limit: 10 })).rejects.toMatchObject({ code: 'AFAD_UNAVAILABLE' });
  });

  it('shares one in-flight request between concurrent calls but fetches fresh afterwards', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const source: AfadSnapshotSource = {
      fetchSnapshot: async () => {
        calls += 1;
        await gate;
        return snapshotFrom(loadFixture());
      },
    };
    const svc = new EarthquakeService({ source, clock });
    const both = Promise.all([svc.getLast24h({ limit: 1 }), svc.getByProvince({ province: 'İzmir', limit: 10 })]);
    release();
    await both;
    expect(calls).toBe(1);
    await svc.getLast24h({ limit: 1 });
    expect(calls).toBe(2);
  });
});

describe('EarthquakeService.getByProvince', () => {
  it('matches only on the province field', async () => {
    const { svc } = service();
    const result = await svc.getByProvince({ province: 'İzmir', limit: 100 });
    expect(result.province).toBe('İzmir');
    expect(result.earthquakes.map((e) => e.id)).toEqual(['900001', '900010']);
  });

  it('does not match offshore events whose location mentions the province', async () => {
    const { svc } = service();
    const result = await svc.getByProvince({ province: 'İstanbul', limit: 100 });
    expect(result.earthquakes.map((e) => e.id)).toEqual(['900005']);
  });

  it('does not match a province named only in location text of another province', async () => {
    const { svc } = service();
    const result = await svc.getByProvince({ province: 'Sivas', limit: 100 });
    expect(result.matchedCount).toBe(0);
    expect(result.warnings.join(' ')).toContain('eşleşme bulunamadı');
  });

  it('does not match a district name that equals a province name', async () => {
    const body = [rawEvent({ eventID: 'd1', province: 'Kahramanmaraş', district: 'Malatya', location: 'Malatya (Kahramanmaraş)' })];
    const { svc } = service(body);
    expect((await svc.getByProvince({ province: 'Malatya', limit: 10 })).matchedCount).toBe(0);
    expect((await svc.getByProvince({ province: 'Kahramanmaraş', limit: 10 })).matchedCount).toBe(1);
  });

  it('matches ASCII spellings in the source province field to the canonical province', async () => {
    const body = [rawEvent({ eventID: 'a1', province: 'IGDIR' })];
    const { svc } = service(body);
    const result = await svc.getByProvince({ province: 'Iğdır', limit: 10 });
    expect(result.earthquakes[0]!.province).toBe('Iğdır');
  });

  it('applies an explicit older range and flags coverage it cannot confirm', async () => {
    const { svc } = service(series(1000, FIXTURE_NOW));
    const result = await svc.getByProvince({
      province: 'Malatya',
      range: { start: new Date('2026-10-01T00:00:00Z'), end: new Date('2026-10-02T00:00:00Z') },
      limit: 100,
    });
    expect(result.matchedCount).toBe(0);
    expect(result.coverage.status).toBe('possibly_incomplete');
  });

  it('includes events on an explicit range boundary', async () => {
    const { svc } = service();
    const result = await svc.getByProvince({
      province: 'Iğdır',
      range: { start: new Date('2026-10-20T08:00:00Z'), end: new Date('2026-10-20T09:00:00Z') },
      limit: 10,
    });
    expect(result.earthquakes.map((e) => e.id)).toEqual(['900008']);
    expect(result.coverage.status).toBe('covered');
  });

  it('guards against inverted or future ranges', async () => {
    const { svc } = service();
    await expect(
      svc.getByProvince({ province: 'İzmir', limit: 1, range: { start: FIXTURE_NOW, end: FIXTURE_NOW } }),
    ).rejects.toThrow(RangeError);
    await expect(
      svc.getByProvince({
        province: 'İzmir',
        limit: 1,
        range: { start: FIXTURE_NOW, end: new Date(FIXTURE_NOW.getTime() + 1000) },
      }),
    ).rejects.toThrow(RangeError);
  });
});
