/**
 * Optional live check against AFAD: one small read-only request (limit=5).
 * Not part of `npm test`. Exits non-zero when live data cannot be verified,
 * so an offline run is never reported as a pass.
 */
import { AfadClient } from '../src/afad/client.ts';
import { toTurkeyIso, toUtcIso } from '../src/utils/time.ts';

const client = new AfadClient({ log: (m) => process.stderr.write(`${m}\n`) });
try {
  const snapshot = await client.fetchSnapshot({ limit: 5 });
  console.log(`OK: AFAD returned ${snapshot.sourceRecordCount} records from ${snapshot.sourceUrl}`);
  for (const e of snapshot.events) {
    console.log(`- ${e.id} ${toUtcIso(e.date)} (${toTurkeyIso(e.date)}) M${e.magnitude} ${e.location ?? '-'} [il: ${e.province ?? 'boş'}]`);
  }
} catch (err) {
  const code = (err as { code?: string }).code ?? 'UNKNOWN';
  const detail = (err as { detail?: string }).detail ?? String(err);
  console.error(`FAILED: live AFAD data could not be verified (${code}: ${detail})`);
  process.exitCode = 1;
}
