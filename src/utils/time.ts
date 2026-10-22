import { TURKEY_TIME_ZONE } from '../config.ts';

const AFAD_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * Parses an AFAD date. AFAD sends offset-less timestamps that are UTC, so a
 * missing offset is interpreted as UTC (never as process-local time).
 * Returns null when the value is not a real calendar timestamp.
 */
export function parseAfadDate(value: string): Date | null {
  const m = AFAD_DATE_RE.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s, frac, offset] = m;
  const year = Number(y);
  const month = Number(mo);
  const day = Number(d);
  const hour = Number(h);
  const minute = Number(mi);
  const second = Number(s);
  const ms = frac ? Number(frac.slice(0, 3).padEnd(3, '0')) : 0;
  if (hour > 23 || minute > 59 || second > 59) return null;
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const check = new Date(utcMs);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  let offsetMs = 0;
  if (offset && offset !== 'Z') {
    const sign = offset.startsWith('-') ? -1 : 1;
    const oh = Number(offset.slice(1, 3));
    const om = Number(offset.slice(4, 6));
    if (oh > 23 || om > 59) return null;
    offsetMs = sign * (oh * 60 + om) * 60_000;
  }
  return new Date(utcMs - offsetMs);
}

/**
 * Parses a user-supplied ISO 8601 timestamp. An explicit `Z` or numeric
 * offset is mandatory; offset-less input is rejected (returns null).
 */
export function parseUserIsoDate(value: string): Date | null {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value.trim())) return null;
  return parseAfadDate(value);
}

/** `2026-10-22T15:09:37Z`; milliseconds are kept only when non-zero. */
export function toUtcIso(date: Date): string {
  const iso = date.toISOString();
  return iso.endsWith('.000Z') ? `${iso.slice(0, -5)}Z` : iso;
}

const turkeyFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TURKEY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZoneName: 'longOffset',
});

/** `2026-10-22T18:09:37+03:00`, independent of the process time zone. */
export function toTurkeyIso(date: Date): string {
  const parts: Record<string, string> = {};
  for (const p of turkeyFormatter.formatToParts(date)) parts[p.type] = p.value;
  const tz = parts.timeZoneName ?? 'GMT';
  const offset = tz === 'GMT' ? '+00:00' : tz.replace('GMT', '');
  const ms = date.getUTCMilliseconds();
  const frac = ms === 0 ? '' : `.${String(ms).padStart(3, '0')}`;
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${frac}${offset}`;
}

/** Human-readable Turkey time for text output: `2026-10-22 18:09:37 TSİ`. */
export function formatTurkeyHuman(date: Date): string {
  const iso = toTurkeyIso(date);
  return `${iso.slice(0, 10)} ${iso.slice(11, 19)} TSİ`;
}
