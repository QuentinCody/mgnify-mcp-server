export const PROTEINS_BASE = "https://www.ebi.ac.uk/metagenomics/proteins/api/v1";
export function proteinId(value: string): string {
  const match = value.match(/^(?:MGYP)?(\d{1,12})$/i);
  if (!match) throw new Error("Use an MGYP protein accession or its numeric identifier");
  return `MGYP${match[1].padStart(12, "0")}`;
}

/** Keep the separate Proteins API's single-filter, single-page contract explicit. */
export function proteinRequest(path: string, input: Record<string, unknown> = {}) {
  const local = new URL(path, "https://www.ebi.ac.uk");
  const params: Record<string, unknown> = Object.fromEntries(local.searchParams);
  for (const [key, value] of Object.entries(input)) if (value !== undefined) params[key] = value;
  const match = path.split("?")[0].match(/^\/protein\/([^/]+)\/?$/);
  if (!match) throw new Error("Unsupported MGnify Proteins route");
  const search = match[1] === "search";
  if (!search) {
    if (Object.keys(params).length) throw new Error("Protein detail does not accept query parameters");
    const id = proteinId(match[1]);
    return { url: new URL(`${PROTEINS_BASE}/protein/${id}`), search, requestedId: id, params };
  }
  const filters = ["biome_id", "biome_lineage", "pfam_accession"];
  if (Object.keys(params).some(key => ![...filters, "limit"].includes(key))) throw new Error("Unsupported protein search parameter; pagination/offset are not available");
  const keys = filters.filter(key => params[key] !== undefined);
  if (keys.length !== 1) throw new Error("Provide exactly one of biome_id, biome_lineage or pfam_accession");
  params.limit = integer(params.limit ?? 50, 1, 1000, "limit");
  if (params.biome_id !== undefined) params.biome_id = integer(params.biome_id, 0, Number.MAX_SAFE_INTEGER, "biome_id");
  if (params.pfam_accession !== undefined && !/^(?:PF)?\d+$/.test(String(params.pfam_accession))) throw new Error("Use a Pfam accession such as PF00005 or 5");
  if (params.biome_lineage !== undefined && !validLineage(params.biome_lineage)) throw new Error("Use a full biome lineage beginning with root");
  const url = new URL(`${PROTEINS_BASE}/protein/search`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return { url, search, requestedId: null, params };
}

function validLineage(value: unknown): boolean {
  return typeof value === "string" && value.length <= 1024 && /^root(?::[^:]+)*$/.test(value) &&
    [...value].every(char => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127);
}

function integer(value: unknown, min: number, max: number, name: string): number {
  if ((typeof value !== "string" && typeof value !== "number") || !/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new Error(`Invalid ${name}`);
  return Number(value);
}

export function replacementUrl(location: string | null, current: URL): URL {
  if (!location) throw new Error("MGnify replacement response has no Location header");
  const url = new URL(location, current);
  const prefix = new URL(PROTEINS_BASE);
  if (url.origin !== prefix.origin || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(`${prefix.pathname}/protein/`)) throw new Error("Unsupported MGnify replacement URL");
  const id = url.pathname.slice(`${prefix.pathname}/protein/`.length);
  return new URL(`${PROTEINS_BASE}/protein/${proteinId(id)}`);
}
