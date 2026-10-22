import {
  AFAD_EVENT_FILTER_URL,
  AFAD_SOURCE_CAP,
  HTTP_MAX_BODY_BYTES,
  HTTP_MAX_RETRIES,
  HTTP_MAX_RETRY_AFTER_MS,
  HTTP_RETRY_DELAY_MS,
  HTTP_TIMEOUT_MS,
  HTTP_TOTAL_BUDGET_MS,
} from '../config.ts';
import type { EarthquakeEvent } from '../domain/earthquake.ts';
import { AfadError } from '../utils/errors.ts';
import { AfadRecordError, afadResponseSchema, normalizeAfadEvent } from './schema.ts';

export type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
export type SleepFn = (ms: number, signal?: AbortSignal) => Promise<void>;

export interface AfadClientOptions {
  fetch?: FetchFn;
  sleep?: SleepFn;
  /** Monotonic milliseconds, used for the total retry budget. */
  monotonicNow?: () => number;
  timeoutMs?: number;
  maxRetries?: number;
  totalBudgetMs?: number;
  maxRetryAfterMs?: number;
  retryDelayMs?: number;
  log?: (message: string) => void;
}

export interface AfadSnapshot {
  sourceUrl: string;
  /** Length of the raw array returned by AFAD. */
  sourceRecordCount: number;
  events: EarthquakeEvent[];
}

export interface AfadSnapshotSource {
  fetchSnapshot(options?: { limit?: number; signal?: AbortSignal }): Promise<AfadSnapshot>;
}

const defaultSleep: SleepFn = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });

export function parseRetryAfter(header: string | null, nowMs: number = Date.now()): number | undefined {
  if (header === null) return undefined;
  const trimmed = header.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  return Number.isNaN(at) ? undefined : Math.max(0, at - nowMs);
}

/** Reads AFAD's latest-events snapshot from the fixed endpoint. */
export class AfadClient implements AfadSnapshotSource {
  readonly #fetch: FetchFn;
  readonly #sleep: SleepFn;
  readonly #now: () => number;
  readonly #timeoutMs: number;
  readonly #maxRetries: number;
  readonly #budgetMs: number;
  readonly #maxRetryAfterMs: number;
  readonly #retryDelayMs: number;
  readonly #log: (message: string) => void;

  constructor(options: AfadClientOptions = {}) {
    this.#fetch = options.fetch ?? ((url, init) => fetch(url, init));
    this.#sleep = options.sleep ?? defaultSleep;
    this.#now = options.monotonicNow ?? (() => performance.now());
    this.#timeoutMs = options.timeoutMs ?? HTTP_TIMEOUT_MS;
    this.#maxRetries = options.maxRetries ?? HTTP_MAX_RETRIES;
    this.#budgetMs = options.totalBudgetMs ?? HTTP_TOTAL_BUDGET_MS;
    this.#maxRetryAfterMs = options.maxRetryAfterMs ?? HTTP_MAX_RETRY_AFTER_MS;
    this.#retryDelayMs = options.retryDelayMs ?? HTTP_RETRY_DELAY_MS;
    this.#log = options.log ?? (() => {});
  }

  static buildUrl(limit: number = AFAD_SOURCE_CAP): string {
    const n = Math.trunc(limit);
    if (!(n >= 1 && n <= AFAD_SOURCE_CAP)) throw new RangeError(`limit must be 1..${AFAD_SOURCE_CAP}`);
    const params = new URLSearchParams({ limit: String(n), orderby: 'timedesc', format: 'json' });
    return `${AFAD_EVENT_FILTER_URL}?${params.toString()}`;
  }

  async fetchSnapshot(options: { limit?: number; signal?: AbortSignal } = {}): Promise<AfadSnapshot> {
    const url = AfadClient.buildUrl(options.limit);
    const body = await this.#fetchJsonWithRetry(url, options.signal);
    return { sourceUrl: AFAD_EVENT_FILTER_URL, ...parseSnapshotBody(body) };
  }

  async #fetchJsonWithRetry(url: string, outer?: AbortSignal): Promise<unknown> {
    const startedAt = this.#now();
    let attempt = 0;
    for (;;) {
      const remaining = this.#budgetMs - (this.#now() - startedAt);
      try {
        return await this.#attempt(url, Math.min(this.#timeoutMs, Math.max(1, remaining)), outer);
      } catch (err) {
        const error = toAfadError(err);
        if (outer?.aborted || !error.retryable || attempt >= this.#maxRetries) throw error;
        const wait =
          error.retryAfterMs !== undefined ? Math.min(error.retryAfterMs, this.#maxRetryAfterMs) : this.#retryDelayMs;
        const left = this.#budgetMs - (this.#now() - startedAt);
        // Retry only if the wait still leaves room for a meaningful attempt.
        if (wait + 1000 > left) throw error;
        this.#log(`AFAD request failed (${error.code}: ${error.detail}); retrying in ${wait} ms`);
        attempt += 1;
        await this.#sleep(wait, outer);
      }
    }
  }

  async #attempt(url: string, timeoutMs: number, outer?: AbortSignal): Promise<unknown> {
    if (outer?.aborted) throw new AfadError('AFAD_UNAVAILABLE', 'request cancelled');
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error('timeout'));
    }, timeoutMs);
    const onOuterAbort = () => controller.abort(outer?.reason);
    outer?.addEventListener('abort', onOuterAbort, { once: true });
    try {
      const res = await this.#fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal,
        redirect: 'error',
      });
      if (res.status === 429) {
        await res.body?.cancel().catch(() => {});
        throw new AfadError('AFAD_RATE_LIMITED', 'HTTP 429', {
          retryable: true,
          retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
        });
      }
      if (res.status >= 500) {
        await res.body?.cancel().catch(() => {});
        throw new AfadError('AFAD_UNAVAILABLE', `HTTP ${res.status}`, { retryable: true });
      }
      if (!res.ok) {
        await res.body?.cancel().catch(() => {});
        throw new AfadError('AFAD_UNAVAILABLE', `HTTP ${res.status}`);
      }
      const text = await res.text();
      if (text.length > HTTP_MAX_BODY_BYTES) throw new AfadError('AFAD_INVALID_RESPONSE', 'response body too large');
      try {
        return JSON.parse(text) as unknown;
      } catch (cause) {
        throw new AfadError('AFAD_INVALID_RESPONSE', 'response is not valid JSON', { cause });
      }
    } catch (err) {
      if (err instanceof AfadError) throw err;
      if (timedOut) throw new AfadError('AFAD_TIMEOUT', `no response within ${timeoutMs} ms`, { retryable: true });
      if (outer?.aborted) throw new AfadError('AFAD_UNAVAILABLE', 'request cancelled');
      throw new AfadError('AFAD_UNAVAILABLE', `network error: ${describe(err)}`, { retryable: true, cause: err });
    } finally {
      clearTimeout(timer);
      outer?.removeEventListener('abort', onOuterAbort);
    }
  }
}

/** Validates the whole response; a single malformed record fails the snapshot. */
export function parseSnapshotBody(body: unknown): { sourceRecordCount: number; events: EarthquakeEvent[] } {
  const parsed = afadResponseSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue ? `${issue.path.join('.') || '(root)'}: ${issue.message}` : 'unknown';
    throw new AfadError('AFAD_INVALID_RESPONSE', `schema mismatch at ${where}`);
  }
  try {
    const events = parsed.data.map((raw, i) => normalizeAfadEvent(raw, i));
    return { sourceRecordCount: parsed.data.length, events };
  } catch (err) {
    if (err instanceof AfadRecordError) throw new AfadError('AFAD_INVALID_RESPONSE', err.message);
    throw err;
  }
}

function toAfadError(err: unknown): AfadError {
  return err instanceof AfadError ? err : new AfadError('AFAD_UNAVAILABLE', describe(err), { cause: err });
}

function describe(err: unknown): string {
  if (err instanceof Error) {
    const cause = err.cause instanceof Error ? ` (${err.cause.message})` : '';
    return `${err.name}: ${err.message}${cause}`;
  }
  return String(err);
}
