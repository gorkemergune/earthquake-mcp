import { AFAD_SOURCE_CAP, LAST_24H_MS } from '../config.ts';
import type { Province } from '../data/provinces.ts';
import type { AfadSnapshot, AfadSnapshotSource } from '../afad/client.ts';
import type { Coverage, EarthquakeEvent, EarthquakeResult, EarthquakeView } from '../domain/earthquake.ts';
import { resolveProvince } from '../utils/province.ts';
import { toTurkeyIso, toUtcIso } from '../utils/time.ts';

export type Clock = () => Date;

export interface TimeRange {
  start: Date;
  end: Date;
}

export interface QueryOptions {
  limit: number;
  minMagnitude?: number | undefined;
}

export interface ProvinceQueryOptions extends QueryOptions {
  province: Province;
  /** When omitted, the last 24 hours ending at the call's `now`. */
  range?: TimeRange | undefined;
}

export const SOURCE_CAP_WARNING =
  `AFAD canlı servisi yalnız en son ${AFAD_SOURCE_CAP} olayı sunar; bu bir arşiv değildir ve sonuçlar bu pencereyle sınırlıdır.`;

/** Collapses repeated event IDs, keeping the most recently updated record. */
export function dedupeEvents(events: readonly EarthquakeEvent[]): EarthquakeEvent[] {
  const byId = new Map<string, EarthquakeEvent>();
  for (const event of events) {
    const current = byId.get(event.id);
    if (!current || isNewer(event, current)) byId.set(event.id, event);
  }
  return [...byId.values()];
}

function isNewer(candidate: EarthquakeEvent, current: EarthquakeEvent): boolean {
  const a = candidate.lastUpdate?.getTime() ?? Number.NEGATIVE_INFINITY;
  const b = current.lastUpdate?.getTime() ?? Number.NEGATIVE_INFINITY;
  if (a !== b) return a > b;
  return candidate.isEventUpdate && !current.isEventUpdate;
}

/** Newest first; ties broken by ID for a stable order. */
export function compareEvents(a: EarthquakeEvent, b: EarthquakeEvent): number {
  const diff = b.date.getTime() - a.date.getTime();
  if (diff !== 0) return diff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Coverage is decided on the whole snapshot, before user filters and limit. */
export function assessCoverage(
  events: readonly EarthquakeEvent[],
  sourceRecordCount: number,
  range: TimeRange,
): Coverage {
  const base = { sourceCap: AFAD_SOURCE_CAP };
  if (events.length === 0) {
    return {
      ...base,
      status: 'unknown',
      oldestAvailableUtc: null,
      latestAvailableUtc: null,
      reason: 'AFAD boş bir kayıt listesi döndürdü; istenen aralığın kapsanıp kapsanmadığı belirlenemedi.',
    };
  }
  let oldest = events[0]!.date;
  let latest = events[0]!.date;
  for (const e of events) {
    if (e.date < oldest) oldest = e.date;
    if (e.date > latest) latest = e.date;
  }
  const window = { ...base, oldestAvailableUtc: toUtcIso(oldest), latestAvailableUtc: toUtcIso(latest) };
  if (oldest.getTime() <= range.start.getTime()) {
    return {
      ...window,
      status: 'covered',
      reason:
        'Alınan kayıtların en eskisi istenen başlangıçtan önce; aralık AFAD\'ın sunduğu güncel katalog penceresi içinde. Bu, gerçek dünyadaki tüm depremlerin eksiksiz listesi anlamına gelmez.',
    };
  }
  if (sourceRecordCount >= AFAD_SOURCE_CAP) {
    return {
      ...window,
      status: 'possibly_incomplete',
      reason: `AFAD ${AFAD_SOURCE_CAP} kayıt sınırına ulaştı ve en eski erişilebilir olay istenen başlangıçtan daha yeni; aralığın erken kısmındaki olaylar eksik olabilir.`,
    };
  }
  return {
    ...window,
    status: 'unknown',
    reason: `AFAD ${AFAD_SOURCE_CAP} kayıttan az döndürdü ve en eski erişilebilir olay istenen başlangıçtan daha yeni; aralığın erken kısmının kapsandığı doğrulanamadı.`,
  };
}

export function toView(event: EarthquakeEvent): EarthquakeView {
  return {
    id: event.id,
    dateUtc: toUtcIso(event.date),
    dateTurkey: toTurkeyIso(event.date),
    latitude: event.latitude,
    longitude: event.longitude,
    depthKm: event.depthKm,
    magnitude: event.magnitude,
    magnitudeType: event.magnitudeType,
    location: event.location,
    province: resolveProvince(event.province) ?? event.province,
    district: event.district,
  };
}

export interface EarthquakeServiceOptions {
  source: AfadSnapshotSource;
  clock?: Clock;
  /** Aborts in-flight AFAD requests on shutdown. */
  signal?: AbortSignal;
}

export class EarthquakeService {
  readonly #source: AfadSnapshotSource;
  readonly #clock: Clock;
  readonly #signal: AbortSignal | undefined;
  #inFlight: Promise<{ snapshot: AfadSnapshot; fetchedAt: Date }> | null = null;

  constructor(options: EarthquakeServiceOptions) {
    this.#source = options.source;
    this.#clock = options.clock ?? (() => new Date());
    this.#signal = options.signal;
  }

  now(): Date {
    return this.#clock();
  }

  async getLast24h(options: QueryOptions): Promise<EarthquakeResult> {
    const now = this.#clock();
    return this.#run({ start: new Date(now.getTime() - LAST_24H_MS), end: now }, options);
  }

  async getByProvince(options: ProvinceQueryOptions): Promise<EarthquakeResult> {
    const now = this.#clock();
    const range = options.range ?? { start: new Date(now.getTime() - LAST_24H_MS), end: now };
    if (!(range.start < range.end)) throw new RangeError('start must be before end');
    if (range.end > now) throw new RangeError('end must not be in the future');
    return this.#run(range, options, options.province);
  }

  /**
   * Concurrent callers share one pending request; once it settles the next
   * call fetches a fresh snapshot (no caching of completed responses).
   */
  #snapshot(): Promise<{ snapshot: AfadSnapshot; fetchedAt: Date }> {
    if (this.#inFlight) return this.#inFlight;
    const fetchedAt = this.#clock();
    const pending = this.#source
      .fetchSnapshot(this.#signal ? { signal: this.#signal } : {})
      .then((snapshot) => ({ snapshot, fetchedAt }))
      .finally(() => {
        if (this.#inFlight === pending) this.#inFlight = null;
      });
    this.#inFlight = pending;
    return pending;
  }

  async #run(range: TimeRange, options: QueryOptions, province?: Province): Promise<EarthquakeResult> {
    const { snapshot, fetchedAt } = await this.#snapshot();
    const events = dedupeEvents(snapshot.events);
    const coverage = assessCoverage(events, snapshot.sourceRecordCount, range);
    const startMs = range.start.getTime();
    const endMs = range.end.getTime();

    const matched = events
      .filter((e) => {
        const t = e.date.getTime();
        if (t < startMs || t > endMs) return false;
        if (options.minMagnitude !== undefined && e.magnitude < options.minMagnitude) return false;
        if (province !== undefined && resolveProvince(e.province) !== province) return false;
        return true;
      })
      .sort(compareEvents);

    const returned = matched.slice(0, options.limit);
    const truncatedByLimit = matched.length > returned.length;

    const warnings = [SOURCE_CAP_WARNING];
    if (coverage.status === 'possibly_incomplete') {
      warnings.push('İstenen aralık AFAD\'ın erişilebilen en eski kaydından önce başlıyor; sonuçlar eksik olabilir.');
    } else if (coverage.status === 'unknown') {
      warnings.push('İstenen aralığın kaynakta tamamen kapsandığı doğrulanamadı.');
    }
    if (truncatedByLimit) {
      warnings.push(`Eşleşen ${matched.length} olayın yalnız en yeni ${returned.length} tanesi gösteriliyor (limit=${options.limit}).`);
    }
    if (matched.length === 0) {
      warnings.push('AFAD\'ın erişilebilen kayıtlarında bu filtreyle eşleşme bulunamadı. Bu, bölgede hiç deprem olmadığı anlamına gelmez.');
    }
    if (province !== undefined) {
      warnings.push('İl eşleşmesi yalnız AFAD kaydındaki il alanıyla yapılır; il alanı boş olan deniz veya sınır ötesi olaylar dahil edilmez.');
    }

    return {
      source: 'AFAD',
      sourceUrl: snapshot.sourceUrl,
      fetchedAtUtc: toUtcIso(fetchedAt),
      requestedRange: { startUtc: toUtcIso(range.start), endUtc: toUtcIso(range.end) },
      ...(province !== undefined ? { province } : {}),
      minMagnitude: options.minMagnitude ?? null,
      limit: options.limit,
      sourceRecordCount: snapshot.sourceRecordCount,
      matchedCount: matched.length,
      returnedCount: returned.length,
      truncatedByLimit,
      coverage,
      warnings,
      earthquakes: returned.map(toView),
    };
  }
}
