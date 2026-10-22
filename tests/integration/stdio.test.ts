import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const FIXTURE_SERVER = fileURLToPath(new URL('./fixture-server.ts', import.meta.url));
const DIST_ENTRY = fileURLToPath(new URL('../../dist/index.js', import.meta.url));

const clients: Client[] = [];
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close().catch(() => {})));
});

async function connect(args: string[]): Promise<Client> {
  const transport = new StdioClientTransport({ command: process.execPath, args, cwd: ROOT, stderr: 'pipe' });
  const client = new Client({ name: 'afad-integration-test', version: '0.0.0' });
  await client.connect(transport);
  clients.push(client);
  return client;
}

function textOf(result: { content?: unknown }): string {
  const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
  return content.map((c) => (c.type === 'text' ? (c.text ?? '') : '')).join('\n');
}

describe('stdio server via the SDK client (fixture data, no network)', () => {
  it('lists exactly two tools with schemas and read-only annotations', async () => {
    const client = await connect([FIXTURE_SERVER]);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_earthquakes_by_province', 'get_last_24h_earthquakes']);
    for (const tool of tools) {
      expect(tool.outputSchema).toBeDefined();
      expect(tool.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false, openWorldHint: true });
      expect(tool.inputSchema.additionalProperties).toBe(false);
    }
    const byProvince = tools.find((t) => t.name === 'get_earthquakes_by_province')!;
    expect(byProvince.inputSchema.required).toEqual(['province']);
  });

  it('calls get_last_24h_earthquakes and returns structured data plus text', async () => {
    const client = await connect([FIXTURE_SERVER]);
    const result = await client.callTool({ name: 'get_last_24h_earthquakes', arguments: { limit: 3 } });
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as Record<string, any>;
    expect(data).toMatchObject({
      source: 'AFAD',
      requestedRange: { startUtc: '2026-10-21T15:00:00Z', endUtc: '2026-10-22T15:00:00Z' },
      sourceRecordCount: 11,
      matchedCount: 8,
      returnedCount: 3,
      truncatedByLimit: true,
      coverage: { status: 'covered', sourceCap: 1000 },
    });
    expect(data.earthquakes[0]).toMatchObject({ id: '900001', dateTurkey: '2026-10-22T18:00:00+03:00' });
    expect(textOf(result)).toContain('Son 24 saatteki depremler');
  });

  it('calls get_earthquakes_by_province with an ASCII province name', async () => {
    const client = await connect([FIXTURE_SERVER]);
    const result = await client.callTool({ name: 'get_earthquakes_by_province', arguments: { province: 'izmir' } });
    expect(result.isError).toBeFalsy();
    const data = result.structuredContent as Record<string, any>;
    expect(data.province).toBe('İzmir');
    expect(data.earthquakes.map((e: { id: string }) => e.id)).toEqual(['900001', '900010']);
    expect(textOf(result)).toContain('İzmir ilindeki depremler');
  });

  it('rejects invalid input through SDK validation', async () => {
    const client = await connect([FIXTURE_SERVER]);
    const unknownProvince = await client.callTool({ name: 'get_earthquakes_by_province', arguments: { province: 'Atlantis' } });
    expect(unknownProvince.isError).toBe(true);
    const offsetless = await client.callTool({
      name: 'get_earthquakes_by_province',
      arguments: { province: 'İzmir', start: '2026-10-21T00:00:00', end: '2026-10-22T00:00:00' },
    });
    expect(offsetless.isError).toBe(true);
    const extraKey = await client.callTool({ name: 'get_last_24h_earthquakes', arguments: { days: 7 } });
    expect(extraKey.isError).toBe(true);
  });

  it('reports AFAD failures as tool errors, never as an empty list', async () => {
    const client = await connect([FIXTURE_SERVER, '--mode=error']);
    const result = await client.callTool({ name: 'get_last_24h_earthquakes', arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    expect(textOf(result)).toContain('[AFAD_UNAVAILABLE]');
    expect(textOf(result)).not.toContain('<html>');
  });
});

describe('stdio stdout hygiene (raw JSON-RPC)', () => {
  it('writes only JSON-RPC messages to stdout', async () => {
    const child = spawn(process.execPath, [FIXTURE_SERVER], { cwd: ROOT, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    const send = (msg: unknown) => child.stdin.write(`${JSON.stringify(msg)}\n`);

    send({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'raw', version: '0' } },
    });
    send({ jsonrpc: '2.0', method: 'notifications/initialized' });
    send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    send({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'get_last_24h_earthquakes', arguments: { limit: 1 } } });
    send({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'get_earthquakes_by_province', arguments: { province: 'ISTANBUL' } } });

    const deadline = Date.now() + 10_000;
    while (stdout.split('\n').filter(Boolean).length < 4 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    child.stdin.end();
    await new Promise((r) => child.once('exit', r));

    const lines = stdout.split('\n').filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThanOrEqual(4);
    const messages = lines.map((l) => JSON.parse(l) as { jsonrpc: string; id?: number; result?: any });
    for (const m of messages) expect(m.jsonrpc).toBe('2.0');
    const byId = new Map(messages.map((m) => [m.id, m]));
    expect(byId.get(2)?.result.tools).toHaveLength(2);
    expect(byId.get(3)?.result.structuredContent.returnedCount).toBe(1);
    expect(byId.get(4)?.result.structuredContent.province).toBe('İstanbul');
    expect(stderr).toContain('[afad-earthquake]');
  });
});

describe.skipIf(!existsSync(DIST_ENTRY))('compiled entry dist/index.js', () => {
  it('starts and lists both tools without contacting AFAD', async () => {
    const client = await connect([DIST_ENTRY]);
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['get_earthquakes_by_province', 'get_last_24h_earthquakes']);
  });
});
