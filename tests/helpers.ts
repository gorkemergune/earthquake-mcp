import { readFileSync } from 'node:fs';
import type { AfadSnapshot, AfadSnapshotSource } from '../src/afad/client.ts';
import { parseSnapshotBody } from '../src/afad/client.ts';
import { AFAD_EVENT_FILTER_URL } from '../src/config.ts';

/** Synthetic fixture (not a real AFAD response). Clock is fixed relative to it. */
export const FIXTURE_NOW = new Date('2026-10-22T15:00:00Z');

export function loadFixture(): Record<string, unknown>[] {
  return JSON.parse(readFileSync(new URL('./fixtures/afad-events.json', import.meta.url), 'utf8')) as Record<
    string,
    unknown
  >[];
}

export function rawEvent(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    eventID: '1',
    location: 'Test (Malatya)',
    latitude: '38.0',
    longitude: '38.0',
    depth: '7',
    type: 'ML',
    magnitude: '2.0',
    country: 'Türkiye',
    province: 'Malatya',
    district: 'Test',
    date: '2026-10-22T12:00:00',
    isEventUpdate: false,
    lastUpdateDate: null,
    ...overrides,
  };
}

export function snapshotFrom(body: unknown): AfadSnapshot {
  return { sourceUrl: AFAD_EVENT_FILTER_URL, ...parseSnapshotBody(body) };
}

export function staticSource(body: unknown): AfadSnapshotSource & { calls: number } {
  const source = {
    calls: 0,
    async fetchSnapshot() {
      source.calls += 1;
      return snapshotFrom(body);
    },
  };
  return source;
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}
