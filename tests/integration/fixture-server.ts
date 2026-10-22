/**
 * Test-only stdio server: same server/tools as production, but the AFAD
 * client gets an injected fake fetch and the clock is fixed. It never opens
 * a network connection. `--mode=error` makes every AFAD request fail with 503.
 */
import { readFileSync } from 'node:fs';
import { AfadClient, type FetchFn } from '../../src/afad/client.ts';
import { EarthquakeService } from '../../src/services/earthquake-service.ts';
import { log, runStdio } from '../../src/stdio.ts';

const mode = process.argv.find((a) => a.startsWith('--mode='))?.slice('--mode='.length) ?? 'ok';
const fixture = readFileSync(new URL('../fixtures/afad-events.json', import.meta.url), 'utf8');

const fakeFetch: FetchFn = async (url) => {
  log(`fixture fetch ${url}`);
  if (mode === 'error') return new Response('<html>Service Unavailable</html>', { status: 503 });
  return new Response(fixture, { status: 200, headers: { 'content-type': 'application/json' } });
};

const service = new EarthquakeService({
  source: new AfadClient({ fetch: fakeFetch, sleep: async () => {}, log }),
  clock: () => new Date('2026-10-22T15:00:00Z'),
});

runStdio(service);
