import type { McpServer } from '@modelcontextprotocol/server';
import * as z from 'zod';
import type { EarthquakeService } from '../services/earthquake-service.ts';
import { resolveProvince } from '../utils/province.ts';
import { parseUserIsoDate } from '../utils/time.ts';
import {
  TOOL_ANNOTATIONS,
  earthquakeResultSchema,
  errorResult,
  limitSchema,
  minMagnitudeSchema,
  successResult,
} from './shared.ts';

export const BY_PROVINCE_TOOL = 'get_earthquakes_by_province';

const isoWithOffset = z
  .string()
  .max(40)
  .refine((v) => parseUserIsoDate(v) !== null, {
    message: 'Açık Z veya UTC offset içeren geçerli bir ISO 8601 tarih olmalı (ör. 2026-10-22T00:00:00Z).',
  });

/** Built per server so `end <= now` uses the injected clock. */
export function buildByProvinceInputSchema(clock: () => Date) {
  return z
    .strictObject({
      province: z
        .string()
        .max(64)
        .refine((v) => resolveProvince(v) !== null, {
          message: 'Türkiye\'nin 81 ilinden biri olmalı (ör. İstanbul, Izmir, sanliurfa).',
        })
        .describe('Türkiye\'nin 81 ilinden biri. Türkçe karakterli veya ASCII yazılabilir.'),
      start: isoWithOffset.optional().describe('Aralık başlangıcı; Z veya offset zorunlu. end ile birlikte verilir.'),
      end: isoWithOffset.optional().describe('Aralık sonu; Z veya offset zorunlu, şu andan ileri olamaz.'),
      limit: limitSchema,
      minMagnitude: minMagnitudeSchema,
    })
    .superRefine((value, ctx) => {
      if ((value.start === undefined) !== (value.end === undefined)) {
        ctx.addIssue({ code: 'custom', path: ['start'], message: 'start ve end birlikte verilmeli ya da ikisi de boş bırakılmalı.' });
        return;
      }
      if (value.start === undefined || value.end === undefined) return;
      const start = parseUserIsoDate(value.start);
      const end = parseUserIsoDate(value.end);
      if (!start || !end) return;
      if (!(start < end)) ctx.addIssue({ code: 'custom', path: ['start'], message: 'start, end değerinden önce olmalı.' });
      if (end > clock()) ctx.addIssue({ code: 'custom', path: ['end'], message: 'end gelecekte olamaz.' });
    });
}

export function registerByProvinceTool(server: McpServer, service: EarthquakeService, log: (m: string) => void): void {
  server.registerTool(
    BY_PROVINCE_TOOL,
    {
      title: 'İle göre depremler (AFAD)',
      description:
        'AFAD canlı servisindeki depremleri kayıttaki il alanına göre filtreler; aralık verilmezse son 24 saat. ' +
        'Kaynak yalnız en son 1000 olayı sunar; eski aralıklar için arşiv garantisi yoktur. Sonuçta kapsam bilgisi yer alır.',
      inputSchema: buildByProvinceInputSchema(() => service.now()),
      outputSchema: earthquakeResultSchema,
      annotations: TOOL_ANNOTATIONS,
    },
    async ({ province, start, end, limit, minMagnitude }) => {
      const canonical = resolveProvince(province);
      const startDate = start === undefined ? null : parseUserIsoDate(start);
      const endDate = end === undefined ? null : parseUserIsoDate(end);
      try {
        if (!canonical) throw new Error('province failed validation');
        const result = await service.getByProvince({
          province: canonical,
          range: startDate && endDate ? { start: startDate, end: endDate } : undefined,
          limit,
          minMagnitude,
        });
        return successResult(`${canonical} ilindeki depremler`, result);
      } catch (err) {
        return errorResult(err, log);
      }
    },
  );
}
