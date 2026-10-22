import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { createServer } from './server.ts';
import type { EarthquakeService } from './services/earthquake-service.ts';

export function log(message: string): void {
  process.stderr.write(`[afad-earthquake] ${message}\n`);
}

/**
 * Serves the MCP server over stdio. stdout carries only protocol messages;
 * all diagnostics go to stderr. Closes cleanly on SIGINT/SIGTERM.
 */
export function runStdio(service: EarthquakeService, shutdown?: AbortController): void {
  const handle = serveStdio(() => createServer({ service, log }), {
    onerror: (error) => log(`transport error: ${error.message}`),
  });
  let closing = false;
  const stop = (signal: string) => {
    if (closing) return;
    closing = true;
    log(`received ${signal}, shutting down`);
    shutdown?.abort(new Error(`shutdown: ${signal}`));
    handle
      .close()
      .catch((error: unknown) => log(`close failed: ${String(error)}`))
      .finally(() => process.exit(0));
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGTERM', () => stop('SIGTERM'));
}
