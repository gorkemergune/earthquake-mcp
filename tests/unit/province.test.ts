import { describe, expect, it } from 'vitest';
import { PROVINCES } from '../../src/data/provinces.ts';
import { normalizeProvinceKey, resolveProvince } from '../../src/utils/province.ts';

describe('province normalization', () => {
  it('has exactly 81 provinces with unique normalized keys', () => {
    expect(PROVINCES).toHaveLength(81);
    expect(new Set(PROVINCES.map(normalizeProvinceKey)).size).toBe(81);
  });

  it.each([
    ['İstanbul', 'İstanbul'],
    ['istanbul', 'İstanbul'],
    ['ISTANBUL', 'İstanbul'],
    ['  İSTANBUL  ', 'İstanbul'],
    ['Iğdır', 'Iğdır'],
    ['igdir', 'Iğdır'],
    ['IĞDIR', 'Iğdır'],
    ['Şanlıurfa', 'Şanlıurfa'],
    ['sanliurfa', 'Şanlıurfa'],
    ['SANLIURFA', 'Şanlıurfa'],
    ['izmir', 'İzmir'],
    ['Kırıkkale', 'Kırıkkale'],
    ['kirklareli', 'Kırklareli'],
    ['Hakkâri', 'Hakkari'],
    ['Elazig', 'Elazığ'],
    ['İstanbul', 'İstanbul'],
  ])('resolves %j to %s', (input, expected) => {
    expect(resolveProvince(input)).toBe(expected);
  });

  it('rejects unknown, partial and empty values', () => {
    for (const value of ['Atlantis', 'İstanb', 'Urfa', 'Maraş', 'Bornova', '', '   ', null, undefined]) {
      expect(resolveProvince(value)).toBeNull();
    }
  });
});
