import { PROVINCES, type Province } from '../data/provinces.ts';

const ASCII_FOLD: Record<string, string> = {
  ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u',
};

/**
 * Folds Turkish and ASCII spellings to one key: trim, NFC, Turkish-aware
 * lowercase, then Turkish letters to ASCII. `İstanbul`, `ISTANBUL` and
 * `istanbul` all become `istanbul`; `Iğdır` and `IGDIR` become `igdir`.
 */
export function normalizeProvinceKey(value: string): string {
  return value
    .trim()
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('tr-TR')
    .replace(/[çğıöşüâîû]/g, (ch) => ASCII_FOLD[ch] ?? ch)
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

const BY_KEY = new Map<string, Province>(PROVINCES.map((p) => [normalizeProvinceKey(p), p]));

/** Exact match against the 81 canonical provinces; no partial or fuzzy matching. */
export function resolveProvince(value: string | null | undefined): Province | null {
  if (typeof value !== 'string') return null;
  const key = normalizeProvinceKey(value);
  if (key === '') return null;
  return BY_KEY.get(key) ?? null;
}
