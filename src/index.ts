#!/usr/bin/env node
import { AfadClient } from './afad/client.ts';
import { EarthquakeService } from './services/earthquake-service.ts';
import { log, runStdio } from './stdio.ts';

const shutdown = new AbortController();
const service = new EarthquakeService({
  source: new AfadClient({ log }),
  signal: shutdown.signal,
});

process.on('uncaughtException', (error) => {
  log(`uncaught exception: ${error.stack ?? error.message}`);
  process.exit(1);
});

runStdio(service, shutdown);
log('stdio server ready');
