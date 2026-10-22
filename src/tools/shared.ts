import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod';
import { DEFAULT_RESULT_LIMIT, MAX_RESULT_LIMIT } from '../config.ts';
import { PROVINCES } from '../data/provinces.ts';
import type { EarthquakeResult } from '../domain/earthquake.ts';
import { cleanText } from '../afad/schema.ts';
import { AfadError } from '../utils/errors.ts';
import { formatTurkeyHuman } from '../utils/time.ts';

export const limitSchema = z
  .number()
  .int()
  .min(1)
  .max(MAX_RESULT_LIMIT)
  .default(DEFAULT_RESULT_LIMIT)
  .describe(`Döndürülecek en fazla deprem sayısı (1-${MAX_RESULT_LIMIT}, varsayılan ${DEFAULT_RESULT_LIMIT}).`);

export const minMagnitudeSchema = z
  .number()
  .min(0)
  .max(10)
  .optional()
  .describe('İsteğe bağlı en düşük büyüklük (0-10, dahil).');

export const TOOL_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
} as const;

const earthquakeViewSchema = z.object({
  id: z.string(),
  dateUtc: z.string(),
  dateTurkey: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  depthKm: z.number().nullable(),
  magnitude: z.number(),
  magnitudeType: z.string().nullable(),
  location: z.string().nullable(),
  province: z.string().nullable(),
  district: z.string().nullable(),
});

export const earthquakeResultSchema = z.object({
  source: z.literal('AFAD'),
  sourceUrl: z.string(),
  fetchedAtUtc: z.string(),
  requestedRange: z.object({ startUtc: z.string(), endUtc: z.string() }),
  province: z.enum(PROVINCES).optional(),
  minMagnitude: z.number().nullable(),
  limit: z.number().int(),
  sourceRecordCount: z.number().int(),
  matchedCount: z.number().int(),
  returnedCount: z.number().int(),
  truncatedByLimit: z.boolean(),
  coverage: z.object({
    status: z.enum(['covered', 'possibly_incomplete', 'unknown']),
    oldestAvailableUtc: z.string().nullable(),
    latestAvailableUtc: z.string().nullable(),
    sourceCap: z.literal(1000),
    reason: z.string(),
  }),
  warnings: z.array(z.string()),
  earthquakes: z.array(earthquakeViewSchema),
});

const COVERAGE_LABELS: Record<EarthquakeResult['coverage']['status'], string> = {
  covered: 'kapsanıyor (yalnız AFAD\'ın güncel penceresi içinde)',
  possibly_incomplete: 'eksik olabilir',
  unknown: 'belirlenemedi',
};

/** Readable summary generated from the same structured result. */
export function renderResultText(title: string, result: EarthquakeResult): string {
  const lines: string[] = [];
  lines.push(`${title} — kaynak: AFAD (${result.sourceUrl})`);
  lines.push(
    `Aralık: ${formatTurkeyHuman(new Date(result.requestedRange.startUtc))} – ${formatTurkeyHuman(new Date(result.requestedRange.endUtc))} ` +
      `(UTC ${result.requestedRange.startUtc} – ${result.requestedRange.endUtc})`,
  );
  if (result.province) lines.push(`İl: ${result.province}`);
  if (result.minMagnitude !== null) lines.push(`En düşük büyüklük: ${result.minMagnitude}`);
  lines.push(`Veri çekim zamanı: ${formatTurkeyHuman(new Date(result.fetchedAtUtc))} (UTC ${result.fetchedAtUtc})`);
  lines.push(
    `Kaynak kayıt: ${result.sourceRecordCount} (sınır ${result.coverage.sourceCap}) · eşleşen: ${result.matchedCount} · gösterilen: ${result.returnedCount} (limit ${result.limit})`,
  );
  const window =
    result.coverage.oldestAvailableUtc && result.coverage.latestAvailableUtc
      ? ` · erişilebilen pencere UTC ${result.coverage.oldestAvailableUtc} – ${result.coverage.latestAvailableUtc}`
      : '';
  lines.push(`Kapsam: ${COVERAGE_LABELS[result.coverage.status]}${window}`);
  lines.push(`Kapsam gerekçesi: ${result.coverage.reason}`);
  for (const w of result.warnings) lines.push(`Uyarı: ${w}`);
  if (result.earthquakes.length > 0) {
    lines.push('');
    lines.push('Depremler (yeniden eskiye, Türkiye saati):');
    result.earthquakes.forEach((e, i) => {
      const depth = e.depthKm === null ? 'derinlik bilinmiyor' : `derinlik ${e.depthKm} km`;
      const mag = `M${e.magnitude}${e.magnitudeType ? ` ${cleanText(e.magnitudeType)}` : ''}`;
      const place = cleanText(e.location) ?? 'konum belirtilmemiş';
      lines.push(
        `${i + 1}. ${formatTurkeyHuman(new Date(e.dateUtc))} | ${mag} | ${depth} | ${place} | ${e.latitude}, ${e.longitude} | AFAD ID ${e.id}`,
      );
    });
  }
  return lines.join('\n');
}

export function successResult(title: string, result: EarthquakeResult): CallToolResult {
  return {
    content: [{ type: 'text', text: renderResultText(title, result) }],
    structuredContent: result as unknown as Record<string, unknown>,
  };
}

/** Runtime failures become MCP tool errors; never an empty earthquake list. */
export function errorResult(err: unknown, log: (message: string) => void): CallToolResult {
  if (err instanceof AfadError) {
    log(`AFAD error ${err.code}: ${err.detail}`);
    return { isError: true, content: [{ type: 'text', text: `[${err.code}] ${err.userMessage}` }] };
  }
  log(`unexpected tool error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  return {
    isError: true,
    content: [{ type: 'text', text: '[AFAD_UNAVAILABLE] Beklenmeyen bir hata oluştu. Canlı veri doğrulanamadı.' }],
  };
}
