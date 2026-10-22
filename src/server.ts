import { McpServer } from '@modelcontextprotocol/server';
import { SERVER_NAME, SERVER_VERSION } from './config.ts';
import type { EarthquakeService } from './services/earthquake-service.ts';
import { registerByProvinceTool } from './tools/by-province.ts';
import { registerLast24hTool } from './tools/last-24h.ts';

export interface ServerDeps {
  service: EarthquakeService;
  log: (message: string) => void;
}

export function createServer({ service, log }: ServerDeps): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      capabilities: { tools: {} },
      instructions:
        'AFAD canlı deprem verisi. Kaynak yalnız en son 1000 olayı sunar; yanıtlarda kaynak, veri çekim zamanı ve kapsam bilgisini belirt. ' +
        'Hata durumunda deprem olmadığını söyleme; canlı verinin doğrulanamadığını bildir.',
    },
  );
  registerLast24hTool(server, service, log);
  registerByProvinceTool(server, service, log);
  return server;
}
