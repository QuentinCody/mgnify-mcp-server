import type { ApiEndpoint, WorkflowRecipe } from "@bio-mcp/shared/codemode/catalog";

export const proteinEndpoints: ApiEndpoint[] = [
  {
    method: "GET", path: "/protein/search", category: "proteins", featured: true,
    summary: "Explore cluster representatives by one biome or Pfam filter through the separate MGnify Proteins API.",
    queryParams: [
      { name: "biome_id", type: "number", required: false, description: "One numeric biome ID discovered from a protein's biomes array; choose exactly one filter" },
      { name: "biome_lineage", type: "string", required: false, description: "Full lineage including root, e.g. root:Engineered:Wastewater; includes sub-biomes" },
      { name: "pfam_accession", type: "string", required: false, description: "Pfam domain such as PF00005 or 5" },
      { name: "limit", type: "number", required: false, description: "Maximum results, 1–1000; default 50. No offset or pagination." },
    ],
    responseShape: "{data: [{mgyp, full_length, cluster_size}], _mgnify_proteins: {source_url, requested_limit, returned, complete:false, pagination:'unsupported', release_pinned:false, native_sha256}}",
    usageHint: "Use api.get, never api.getAll: this is a capped single-page search with no total. Request each MGYP detail separately for sequences/annotations. The Proteins API uses ordinary JSON, not the main API's JSON:API. No cluster-representative match does not establish absence of the protein in the entire database.",
  },
  {
    method: "GET", path: "/protein/{mgyp}", category: "proteins", featured: true,
    summary: "Read a cluster representative's sequence, full-length/fragment flag, cluster size, biomes, Pfam domains and source contig coordinates.",
    pathParams: [{ name: "mgyp", type: "string", required: true, description: "MGYP accession, lowercase equivalent or numeric identifier; the adapter canonicalizes to uppercase MGYP plus twelve digits before fetching, e.g. MGYP000261684433" }],
    responseShape: "{data: native protein record, _mgnify_proteins: {requested_mgyp, resolved_mgyp, redirects, source_url, retrieved_at, native_sha256, release_pinned:false}}",
    usageHint: "Routed to https://www.ebi.ac.uk/metagenomics/proteins/api/v1. Up to three documented 302 replacements are followed only within this protein service and retained explicitly. Native string/list error details remain errors. Records describe cluster representatives; no structure coordinates or pinned data release are implied. Preserve the complete envelope or staging handle for source/identity evidence.",
  },
];

export const proteinWorkflow: WorkflowRecipe = {
  title: "Explore a small Pfam protein sample with sequence provenance",
  description: "Read at most three PF00005 cluster representatives, then their sequences, predicted domain annotations and assembly/contig context. Preserve replacement IDs and native records or staging handles; this is a bounded exploration, not all proteins or experimental functional validation.",
  keywords: ["protein", "MGYP", "Pfam", "biome", "sequence", "contig", "ESM"],
  code: 'const search = await api.get("/protein/search", {pfam_accession:"PF00005", limit:3}); if (search.__staged || search.__api_error) return search; const proteins = []; for (const row of search.data) proteins.push(await api.get("/protein/{mgyp}", {mgyp:row.mgyp})); return {search, proteins, interpretation:"Cluster representatives with native provenance. Retain any staged/error detail handle. Verify exact sequences before joining structure datasets; this API does not pin a database release."};',
};
