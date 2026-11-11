import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { hashCanonicalJson } from "@bio-mcp/shared";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { createMgnifyApiFetch } from "./api-adapter";
import { PROTEINS_BASE } from "./protein-request";
import { mgnifyCatalog } from "../spec/catalog";
import { proteinWorkflow } from "../spec/proteins";

const mgyp = "MGYP000261684433";
// Synthetic example using the provider's documented native field names.
const record = { mgyp, sequence: "MPEPTIDE", full_length: false, cluster_size: 1,
  biomes: [{ id: 132, name: "root:Environmental:Aquatic:Marine", count: 1 }],
  pfam_annotations: [{ accession: "PF00005", clan: null, evalue: 1e-20, hmm_start: 2, env_start: 325 }],
  study_assembly_contigs: [{ study_accession: "ERP108403", assembly_accession: "ERZ534239", contig_accession: "MGYC000564781877", start: 931, end: 2196, strand: "-" }], extension: { preserve: true } };
const adapter = createMgnifyApiFetch();
const get = (path = `/protein/${mgyp}`, params?: Record<string, unknown>) => adapter({ method: "GET", path, params });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("executes the discoverable Pfam-to-sequence recipe through the actual proxy and retains every native field", async () => {
  const fetch = vi.fn(async (url: URL) => Response.json(url.pathname.endsWith("/search") ? [{ mgyp, full_length: false, cluster_size: 1 }] : record));
  vi.stubGlobal("fetch", fetch);
  const proxy = createApiProxyTool({ catalog: mgnifyCatalog, apiFetch: adapter, doNamespace: {} as DurableObjectNamespace, stagingPrefix: "mgnify" });
  const api = { get: (path: string, params: Record<string, unknown>) => proxy.handler({ method: "GET", path, params }, {} as Parameters<typeof proxy.handler>[1]) };
  const result = await runInNewContext(`(async()=>{${proteinWorkflow.code}})()`, { api });
  expect(result.search).toMatchObject({ complete: false, pagination: "unsupported", _mgnify_proteins: { requested_limit: 3, returned: 1, complete: false } });
  expect(result.proteins[0]).toMatchObject({ data: record, _mgnify_proteins: { requested_mgyp: mgyp, resolved_mgyp: mgyp, redirects: [], release_pinned: false, native_sha256: await hashCanonicalJson(record) } });
  expect(fetch.mock.calls.map(([url]) => url.href)).toEqual([`${PROTEINS_BASE}/protein/search?pfam_accession=PF00005&limit=3`, `${PROTEINS_BASE}/protein/${mgyp}`]);
  expect(mgnifyCatalog.endpointCount).toBe(mgnifyCatalog.endpoints.length);
});

it.each(["mgyp000261684433", "261684433"])("normalizes documented MGYP spelling %s", async input => {
  const fetch = vi.fn(async (_url: URL) => Response.json(record)); vi.stubGlobal("fetch", fetch);
  expect(await get(`/protein/${input}`)).toMatchObject({ data: { data: record } });
  expect(String(fetch.mock.calls[0][0])).toBe(`${PROTEINS_BASE}/protein/${mgyp}`);
});

it.each([{ biome_id: 132 }, { biome_lineage: "root:Host-associated:Human:Digestive system" }, { pfam_accession: 5 }])("preserves the documented search filter %j and explicit absence scope", async params => {
  const fetch = vi.fn(async (_url: URL) => Response.json([])); vi.stubGlobal("fetch", fetch);
  expect(await get("/protein/search", params)).toMatchObject({ data: { data: [], complete: false, _mgnify_proteins: { requested_limit: 50, returned: 0 } } });
  const url = fetch.mock.calls[0][0] as URL;
  for (const [key, value] of Object.entries(params)) expect(url.searchParams.get(key)).toBe(String(value));
});

it.each([
  {}, { biome_id: 132, pfam_accession: "PF00005" }, { biome_lineage: "Wastewater" },
  { pfam_accession: "PF00005", offset: 50 }, { pfam_accession: "PF00005", page: 2 },
  { pfam_accession: "PF00005", limit: 1001 }, { pfam_accession: "PF00005", limit: 0 },
  { biome_id: -1 }, { biome_id: "1.1" }, { pfam_accession: "abc" },
])("rejects invalid or unsupported search %j before fetching", async params => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(get("/protein/search", params)).rejects.toThrow(); expect(fetch).not.toHaveBeenCalled();
});

it("keeps a bounded representative replacement chain instead of silently changing identity", async () => {
  const replacement = "MGYP000000000012";
  const fetch = vi.fn().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: `${PROTEINS_BASE}/protein/${replacement}` } })).mockResolvedValueOnce(Response.json({ ...record, mgyp: replacement }));
  vi.stubGlobal("fetch", fetch);
  expect(await get()).toMatchObject({ data: { data: { mgyp: replacement }, _mgnify_proteins: { requested_mgyp: mgyp, resolved_mgyp: replacement, redirects: [{ from: `${PROTEINS_BASE}/protein/${mgyp}`, to: `${PROTEINS_BASE}/protein/${replacement}` }] } } });
  expect(fetch.mock.calls.every(([, init]) => init.redirect === "manual")).toBe(true);
});

it.each(["https://evil.invalid/protein/MGYP000000000012", "https://www.ebi.ac.uk/other/MGYP000000000012", "/metagenomics/proteins/api/v1/protein/search", "?token=hidden", "#fragment"])("rejects a non-protein replacement %s without following", async location => {
  const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location } })); vi.stubGlobal("fetch", fetch);
  await expect(get()).rejects.toThrow(); expect(fetch).toHaveBeenCalledTimes(1);
});

it("stops replacement cycles and more than three hops", async () => {
  const fetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: `${PROTEINS_BASE}/protein/${mgyp}` } }));
  vi.stubGlobal("fetch", fetch); await expect(get()).rejects.toThrow("cycle"); expect(fetch).toHaveBeenCalledTimes(1);
  let id = 1; fetch.mockClear(); fetch.mockImplementation(async () => new Response(null, { status: 302, headers: { location: `${PROTEINS_BASE}/protein/${id++}` } }));
  await expect(get()).rejects.toThrow("excessive"); expect(fetch).toHaveBeenCalledTimes(4);
});

it.each(["Unknown protein", [{ type: "value_error", loc: ["query"], msg: "Invalid biome" }]])("preserves both documented native error shapes (%#)", async detail => {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ detail }, { status: 422 })));
  await expect(get()).rejects.toMatchObject({ status: 422, data: { detail } });
});

it("rejects identity drift, invalid JSON and malformed search rather than reporting successful absence", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ ...record, mgyp: "MGYP000000000012" })).mockResolvedValueOnce(new Response("<html>down</html>")).mockResolvedValueOnce(Response.json({ results: [] }));
  vi.stubGlobal("fetch", fetch);
  await expect(get()).rejects.toThrow("does not match"); await expect(get()).rejects.toThrow("expected JSON");
  await expect(get("/protein/search", { pfam_accession: 5 })).rejects.toThrow("Unrecognized");
});

it.each([false, true])("keeps large protein evidence and any search cap recoverable through the real staging path (search=%s)", async search => {
  const large = search ? [{ mgyp, full_length: false, cluster_size: 1, extension: "x".repeat(60000) }] : { ...record, sequence: "M".repeat(60000) };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(large)));
  const stored: unknown[] = [];
  const namespace = { idFromName: (name: string) => name, get: () => ({ fetch: async (request: Request) => {
    if (new URL(request.url).pathname !== "/process") return Response.json({ success: true, schema: {} });
    const { data } = await request.json() as { data: unknown }; stored.push(typeof data === "string" ? JSON.parse(data) : data);
    return Response.json({ success: true, tables_created: ["proteins", "payloads"], total_rows: 1 });
  } }) };
  const proxy = createApiProxyTool({ catalog: mgnifyCatalog, apiFetch: adapter, doNamespace: namespace as unknown as DurableObjectNamespace, stagingPrefix: "mgnify", maxInlineBytes: 30 * 1024 });
  const result = await proxy.handler({ method: "GET", path: search ? "/protein/search" : "/protein/{mgyp}", params: search ? { pfam_accession: 5, limit: 1 } : { mgyp } }, {} as Parameters<typeof proxy.handler>[1]);
  expect(result).toMatchObject({ __staged: true, data_access_id: expect.any(String), _staging: expect.any(Object) });
  expect(stored).toContainEqual(expect.objectContaining({ data: large, _mgnify_proteins: expect.objectContaining({ native_sha256: await hashCanonicalJson(large) }) }));
  if (search) expect(result).toMatchObject({ complete: false, pagination: "unsupported" });
});

it("bounds bytes and uses a single header/body deadline", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("x".repeat(5_000_001))));
  await expect(get()).rejects.toThrow("read budget");
  vi.useFakeTimers(); const cancel = vi.fn(); let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", vi.fn(async (_url, init) => {
    signal = init.signal; await new Promise(resolve => setTimeout(resolve, 20000));
    return new Response(new ReadableStream({ cancel }));
  }));
  const pending = expect(get()).rejects.toThrow("deadline");
  await vi.advanceTimersByTimeAsync(30000); await pending;
  expect(signal?.aborted).toBe(true); expect(cancel).toHaveBeenCalled();
});

it("returns a staged search handle unchanged from the recipe", async () => {
  const staged = { __staged: true, data_access_id: "fixture", complete: false };
  const get = vi.fn(async () => staged);
  expect(await runInNewContext(`(async()=>{${proteinWorkflow.code}})()`, { api: { get } })).toEqual(staged);
  expect(get).toHaveBeenCalledTimes(1);
});
