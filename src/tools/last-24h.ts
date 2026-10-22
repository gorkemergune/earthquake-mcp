import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { EarthquakeService } from '../services/earthquake-service.ts';
import {
  TOOL_ANNOTATIONS,
  earthquakeResultSchema,
  errorResult,
  limitSchema,
  minMagnitudeSchema,
  successResult,
} from './shared.ts';

export const LAST_24H_TOOL = 'get_last_24h_earthquakes';

export const last24hInputSchema = z.strictObject({
  limit: limitSchema,
  minMagnitude: minMagnitudeSchema,
});

export function registerLast24hTool(server: McpServer, service: EarthquakeService, log: (m: string) => void): void {
  server.registerTool(
    LAST_24H_TOOL,
    {
      title: 'Son 24 saatteki depremler (AFAD)',
      description:
        'AFAD canlı servisinden çağrı anına göre son 24 saatteki (takvim günü değil) depremleri yeniden eskiye döndürür. ' +
        'Kaynak yalnız en son 1000 olayı sunar; sonuçta kapsam bilgisi, UTC ve Türkiye saati yer alır.',
      inputSchema: last24hInputSchema,
      outputSchema: earthquakeResultSchema,
      annotations: TOOL_ANNOTATIONS,
    },
    async ({ limit, minMagnitude }) => {
      try {
        const result = await service.getLast24h({ limit, minMagnitude });
        return successResult('Son 24 saatteki depremler', result);
      } catch (err) {
        return errorResult(err, log);
      }
    },
  );
}
