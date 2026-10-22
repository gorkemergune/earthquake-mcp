import type { Province } from '../data/provinces.ts';

/** One validated AFAD event with numeric fields parsed and dates in UTC. */
export interface EarthquakeEvent {
  id: string;
  date: Date;
  latitude: number;
  longitude: number;
  depthKm: number | null;
  magnitude: number;
  magnitudeType: string | null;
  location: string | null;
  province: string | null;
  district: string | null;
  lastUpdate: Date | null;
  isEventUpdate: boolean;
}

export type CoverageStatus = 'covered' | 'possibly_incomplete' | 'unknown';

export interface Coverage {
  status: CoverageStatus;
  oldestAvailableUtc: string | null;
  latestAvailableUtc: string | null;
  sourceCap: number;
  reason: string;
}

export interface EarthquakeView {
  id: string;
  dateUtc: string;
  dateTurkey: string;
  latitude: number;
  longitude: number;
  depthKm: number | null;
  magnitude: number;
  magnitudeType: string | null;
  location: string | null;
  province: string | null;
  district: string | null;
}

export interface EarthquakeResult {
  source: 'AFAD';
  sourceUrl: string;
  fetchedAtUtc: string;
  requestedRange: { startUtc: string; endUtc: string };
  province?: Province;
  minMagnitude: number | null;
  limit: number;
  sourceRecordCount: number;
  matchedCount: number;
  returnedCount: number;
  truncatedByLimit: boolean;
  coverage: Coverage;
  warnings: string[];
  earthquakes: EarthquakeView[];
}
