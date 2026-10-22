import { afterEach, describe, expect, it } from 'vitest';
import { formatTurkeyHuman, parseAfadDate, parseUserIsoDate, toTurkeyIso, toUtcIso } from '../../src/utils/time.ts';

const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('time utils', () => {
  it('treats offset-less AFAD dates as UTC and converts to Turkey time', () => {
    const d = parseAfadDate('2026-10-22T15:09:37');
    expect(d).not.toBeNull();
    expect(toUtcIso(d!)).toBe('2026-10-22T15:09:37Z');
    expect(toTurkeyIso(d!)).toBe('2026-10-22T18:09:37+03:00');
    expect(formatTurkeyHuman(d!)).toBe('2026-10-22 18:09:37 TSİ');
  });

  it('gives identical results regardless of the process time zone', () => {
    const results = new Set<string>();
    for (const tz of ['UTC', 'America/New_York', 'Asia/Tokyo', 'Europe/Istanbul', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      const d = parseAfadDate('2026-03-29T23:30:00')!;
      results.add(`${toUtcIso(d)}|${toTurkeyIso(d)}|${parseUserIsoDate('2026-03-30T02:30:00+03:00')!.toISOString()}`);
    }
    expect([...results]).toEqual(['2026-03-29T23:30:00Z|2026-03-30T02:30:00+03:00|2026-03-29T23:30:00.000Z']);
  });

  it('crosses the day boundary when converting to Turkey time', () => {
    expect(toTurkeyIso(parseAfadDate('2026-12-31T22:30:00')!)).toBe('2027-01-01T01:30:00+03:00');
  });

  it('rejects impossible calendar dates and garbage', () => {
    expect(parseAfadDate('2026-02-30T10:00:00')).toBeNull();
    expect(parseAfadDate('2026-10-22T24:00:00')).toBeNull();
    expect(parseAfadDate('22.10.2026 15:09')).toBeNull();
    expect(parseAfadDate('')).toBeNull();
  });

  it('requires an explicit offset for user-supplied dates', () => {
    expect(parseUserIsoDate('2026-10-22T15:00:00')).toBeNull();
    expect(parseUserIsoDate('2026-10-22')).toBeNull();
    expect(parseUserIsoDate('2026-10-22T15:00:00Z')?.toISOString()).toBe('2026-10-22T15:00:00.000Z');
    expect(parseUserIsoDate('2026-10-22T18:00:00+03:00')?.toISOString()).toBe('2026-10-22T15:00:00.000Z');
    expect(parseUserIsoDate('2026-10-22T10:00:00.5-05:00')?.toISOString()).toBe('2026-10-22T15:00:00.500Z');
  });

  it('keeps milliseconds only when non-zero', () => {
    expect(toUtcIso(new Date('2026-10-22T15:00:00.250Z'))).toBe('2026-10-22T15:00:00.250Z');
    expect(toTurkeyIso(new Date('2026-10-22T15:00:00.250Z'))).toBe('2026-10-22T18:00:00.250+03:00');
  });
});
