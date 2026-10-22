import * as z from 'zod';
import type { EarthquakeEvent } from '../domain/earthquake.ts';
import { parseAfadDate } from '../utils/time.ts';

const scalar = z.union([z.string(), z.number()]);
const optionalText = z.union([z.string(), z.null()]).optional();

/** Raw AFAD record. Unknown extra fields are tolerated. */
export const afadRawEventSchema = z.looseObject({
  eventID: z.union([z.string().trim().min(1), z.number().int().nonnegative()]),
  date: z.string(),
  latitude: scalar,
  longitude: scalar,
  magnitude: scalar,
  depth: z.union([scalar, z.null()]).optional(),
  type: optionalText,
  location: optionalText,
  province: optionalText,
  district: optionalText,
  lastUpdateDate: optionalText,
  isEventUpdate: z.union([z.boolean(), z.null()]).optional(),
});

export const afadResponseSchema = z.array(afadRawEventSchema);

export type AfadRawEvent = z.infer<typeof afadRawEventSchema>;

export class AfadRecordError extends Error {}

function toNumber(value: string | number, field: string, index: number): number {
  const n = typeof value === 'number' ? value : value.trim() === '' ? Number.NaN : Number(value.trim());
  if (!Number.isFinite(n)) throw new AfadRecordError(`record ${index}: ${field} is not a finite number`);
  return n;
}

/** Source text is data: strip control characters and collapse whitespace. */
export function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ').replace(/\s+/g, ' ').trim();
  return cleaned === '' ? null : cleaned;
}

/** Converts one schema-valid raw record; throws AfadRecordError on bad required fields. */
export function normalizeAfadEvent(raw: AfadRawEvent, index: number): EarthquakeEvent {
  const date = parseAfadDate(raw.date);
  if (!date) throw new AfadRecordError(`record ${index}: date is not a valid timestamp`);
  const latitude = toNumber(raw.latitude, 'latitude', index);
  const longitude = toNumber(raw.longitude, 'longitude', index);
  if (latitude < -90 || latitude > 90) throw new AfadRecordError(`record ${index}: latitude out of range`);
  if (longitude < -180 || longitude > 180) throw new AfadRecordError(`record ${index}: longitude out of range`);
  const magnitude = toNumber(raw.magnitude, 'magnitude', index);
  const depthRaw = raw.depth;
  const depthKm =
    depthRaw === null || depthRaw === undefined || (typeof depthRaw === 'string' && depthRaw.trim() === '')
      ? null
      : toNumber(depthRaw, 'depth', index);
  const lastUpdate = typeof raw.lastUpdateDate === 'string' ? parseAfadDate(raw.lastUpdateDate) : null;

  return {
    id: String(raw.eventID).trim(),
    date,
    latitude,
    longitude,
    depthKm,
    magnitude,
    magnitudeType: cleanText(raw.type),
    location: cleanText(raw.location),
    province: cleanText(raw.province),
    district: cleanText(raw.district),
    lastUpdate,
    isEventUpdate: raw.isEventUpdate === true,
  };
}
