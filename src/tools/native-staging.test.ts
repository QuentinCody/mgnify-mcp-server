/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import nativeProtein from "../../test/fixtures/protein.json";
import { afterEach, expect, it, vi } from "vitest";
import { McpServer } from "@bio-mcp/shared/mcp";
import { verifyCitationEnvelope } from "@bio-mcp/shared";
import { DynamicWorkerExecutor } from "@bio-mcp/shared/codemode/execute-tool";
vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
import { MgnifyDataDO } from "../do";
import { registerCodeMode } from "./code-mode";
import { registerQueryData } from "./query-data";
import { registerGetSchema } from "./get-schema";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function createStore() {
  const database = new DatabaseSync(":memory:");
  let ready = Promise.resolve();
  const exec = (query: string, ...values: any[]) => {
    const rows = database.prepare(query).all(...values);
    const iterator = rows[Symbol.iterator]();
    return { toArray: () => rows, one: () => rows[0], next: () => iterator.next(), [Symbol.iterator]: () => iterator };
  };
  const transactionSync = <T>(run: () => T): T => {
    database.exec("BEGIN");
    try { const result = run(); database.exec("COMMIT"); return result; }
    catch (error) { database.exec("ROLLBACK"); throw error; }
  };
  const ctx = { blockConcurrencyWhile: (run: () => Promise<void>) => { ready = run(); return ready; }, storage: { sql: { exec }, transactionSync } };
  const instance = new MgnifyDataDO(ctx as unknown as DurableObjectState, {} as Cloudflare.Env);
  return { database, instance, ready };
}

function fixture() {
  // Exercise generated API helpers and user code; replace only the platform isolate.
  vi.spyOn(DynamicWorkerExecutor.prototype, "execute").mockImplementation(async (code, functions) => {
    const staged: Array<Record<string, unknown>> = [];
    try {
      const run = new Function("codemode", "__stagedResults", "console", `return (${code})();`);
      const result = await run(functions, staged, { warn() {}, log() {} });
      return { result: JSON.parse(JSON.stringify(result)), __stagedResults: staged };
    } catch (error) { return { error: String((error as Error).message), __stagedResults: staged }; }
  });
  const stores = new Map<string, ReturnType<typeof createStore>>();
  const namespace = { idFromName: (name: string) => name, get: (id: string) => ({ fetch: async (request: Request) => {
    let store = stores.get(id);
    if (!store) { store = createStore(); stores.set(id, store); }
    await store.ready;
    return store.instance.fetch(request);
  } }) };
  const env = { MGNIFY_DATA_DO: namespace, CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1];
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, env); registerQueryData(server, env); registerGetSchema(server, env);
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<any> }> })._registeredTools;
  return { tools, close: () => { for (const store of stores.values()) store.database.close(); } };
}

async function recover(f: ReturnType<typeof fixture>, id: string, prefix: string) {
  const rows = async (sql: string) => {
    const output = await f.tools[`${prefix}mgnify_query_data`].handler({ data_access_id: id, sql }, {});
    expect(output.isError, JSON.stringify(output)).not.toBe(true);
    expect(output.structuredContent.staged).not.toBe(true);
    expect(new TextEncoder().encode(JSON.stringify(output)).byteLength).toBeLessThan(30720);
    return output.structuredContent.data.rows;
  };
  const text = async (table: string, column: string, where: string) => {
    const [{ n }] = await rows(`SELECT length(${column}) AS n FROM ${table} WHERE ${where}`);
    let result = "";
    for (let start = 1; start <= n; start += 1000) {
      const [row] = await rows(`SELECT substr(${column}, ${start}, 1000) AS part FROM ${table} WHERE ${where}`);
      result += row.part;
    }
    return result;
  };
  let raw = await text("payloads", "root_json", "id = 1");
  if (raw.startsWith("__CHUNKED__:")) {
    const chunk = raw.slice("__CHUNKED__:".length);
    expect(chunk).toMatch(/^chunk_[a-f0-9]{32}$/);
    const parts = await rows(`SELECT chunk_index FROM content_chunks WHERE content_id = '${chunk}' ORDER BY chunk_index`);
    raw = "";
    for (const part of parts) raw += await text("content_chunks", "chunk_data", `content_id = '${chunk}' AND chunk_index = ${part.chunk_index}`);
  }
  const decoded = JSON.parse(raw);
  return typeof decoded === "string" ? JSON.parse(decoded) : decoded;
}

it("preserves a native representative's sequence, fragment flag and nested annotations through SQLite", async () => {
  const f = fixture();
  // Captured from the public protein endpoint on 2026-10-04 UTC; padding exercises staging.
  const native = { ...nativeProtein, extension: "α🧬".repeat(8000) };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(native)));
  try { for (const prefix of ["", "mcp_"]) {
    const args = { code: "return await api.get('/protein/MGYP000261684433');" };
    const output = await f.tools[prefix + "mgnify_execute"].handler(args, {});
    expect(output.isError, JSON.stringify(output)).not.toBe(true);
    const id = output.structuredContent.data.data_access_id;
    const materialized = await recover(f, id, prefix);
    expect(materialized.data).toEqual(native);
    expect((await verifyCitationEnvelope({ citation: output.structuredContent._meta.citation, structuredContent: output.structuredContent,
      toolArguments: args, materialized: { value: materialized } })).verification).toMatchObject({ query: "verified", result: "verified" });
    const query = (sql: string) => f.tools[prefix + "mgnify_query_data"].handler({ data_access_id: id, sql }, {});
    expect((await query("SELECT mgyp,sequence,full_length,cluster_size FROM proteins")).structuredContent.data.rows).toEqual([
      { mgyp: native.mgyp, sequence: native.sequence, full_length: 0, cluster_size: native.cluster_size }]);
    expect((await query("SELECT accession,clan,evalue FROM proteins_pfam_annotations")).structuredContent.data.rows).toEqual(
      native.pfam_annotations.map(({ accession, clan, evalue }: any) => ({ accession, clan, evalue })));
    expect((await query("SELECT contig_accession,start,end,strand FROM proteins_study_assembly_contigs")).structuredContent.data.rows).toEqual(
      native.study_assembly_contigs.map(({ contig_accession, start, end, strand }: any) => ({ contig_accession, start, end, strand })));
  } } finally { f.close(); }
});

it("keeps protein samples incomplete through direct/composed staging and recovers large SQL with native row IDs", async () => {
  const f = fixture();
  const proteins = Array.from({ length: 1000 }, (_, i) => ({ mgyp: `MGYP${String(i + 1).padStart(12, "0")}`, full_length: i % 2 === 0, cluster_size: i }));
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(proteins)));
  try { for (const prefix of ["", "mcp_"]) {
    for (const composed of [false, true]) {
      const call = "await api.get('/protein/search',{pfam_accession:'PF00005',limit:1000})";
      const output = await f.tools[prefix + "mgnify_execute"].handler({ code: `return ${composed ? `{page:${call}}` : call};` }, {});
      expect(output.isError, JSON.stringify(output)).not.toBe(true);
      expect(output.structuredContent._meta.completeness).toMatchObject({ complete: false, returned: 1000 });
      const handle = composed ? output.structuredContent.data.page : output.structuredContent.data;
      expect((await recover(f, handle.data_access_id, prefix)).data).toEqual(proteins);
      const args = { data_access_id: handle.data_access_id, sql: "SELECT * FROM proteins LIMIT 500", limit: 500 };
      const query = await f.tools[prefix + "mgnify_query_data"].handler(args, {});
      expect(query.isError, JSON.stringify(query)).not.toBe(true);
      const full = await recover(f, query.structuredContent.data_access_id, prefix);
      expect(full.structuredContent.data.rows).toHaveLength(500);
      expect(full.structuredContent.data.rows[0]).toMatchObject({ _rowid: 1, mgyp: proteins[0].mgyp });
      expect((await verifyCitationEnvelope({ citation: query.structuredContent._meta.citation, structuredContent: query.structuredContent,
        toolArguments: args, materialized: { value: full } })).verification).toMatchObject({ query: "verified", result: "verified" });
    }
  } } finally { f.close(); }
});

it("preserves full native HTTP evidence and cites discovery, schema, SQL and failed calls", async () => {
  const f = fixture(); const body = { detail: [{ msg: "α🧬".repeat(9000), type: "native_failure" }] };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(body, { status: 422 })));
  try { for (const prefix of ["", "mcp_"]) {
    const error = await f.tools[prefix + "mgnify_execute"].handler({ code: "return await api.get('/protein/search',{biome_id:132});" }, {});
    expect(error).toMatchObject({ isError: true, structuredContent: { success: false, data: { status: 422 } } });
    expect(await recover(f, error.structuredContent.data.data.data_access_id, prefix)).toEqual(body);
    const composed = await f.tools[prefix + "mgnify_execute"].handler({ code: "return {observations:[await api.get('/protein/search',{biome_id:132})]};" }, {});
    expect(composed).toMatchObject({ isError: true, structuredContent: { success: false, data: { __api_error: true, status: 422 } } });
    expect(await recover(f, composed.structuredContent.data.data.data_access_id, prefix)).toEqual(body);
    for (const [name, args] of [["search", { query: "Pfam", max_results: 2 }], ["get_schema", { data_access_id: "missing" }],
      ["query_data", { data_access_id: "missing", sql: "SELECT * FROM absent" }], ["execute", { code: "throw Error('fixture failure');" }]] as const) {
      const result = await f.tools[prefix + "mgnify_" + name].handler(args, {});
      expect((await verifyCitationEnvelope({ citation: result.structuredContent._meta.citation, structuredContent: result.structuredContent,
        toolArguments: args })).verification).toMatchObject({ query: "verified", result: "verified" });
    }
  } } finally { f.close(); }
});
