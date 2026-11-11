import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";
import { genomeEndpoints, genomeWorkflows } from "./genomes";
import { proteinEndpoints, proteinWorkflow } from "./proteins";

export const mgnifyCatalog: ApiCatalog = {
    name: "MGnify",
    baseUrl: "https://www.ebi.ac.uk/metagenomics/api/v1",
    version: "v1",
    auth: "none",
    endpointCount: 12 + genomeEndpoints.length + proteinEndpoints.length,
    workflows: [...genomeWorkflows, proteinWorkflow],
    notes:
        "- MGnify is EBI's microbiome resource — metagenomic & metatranscriptomic studies, samples, runs, analyses, biomes.\n" +
        "- /protein/* uses the separate https://www.ebi.ac.uk/metagenomics/proteins/api/v1 service. It returns {data:native JSON,_mgnify_proteins:source context}, not JSON:API; search has a single filter and capped results with no pagination. Protein database release is not pinned by API v1.\n" +
        "- Responses are JSON:API — records live under `.data[]` and relationships/metadata under `.included[]` and `.meta`.\n" +
        "  Large responses stage automatically. Records are under data; api.getAll uses itemsField:'data', strategy:'page', pageSizeParam:'page_size'.\n" +
        "- The adapter preserves meta.pagination/links and adds total_count/next for completeness checks. Catalogue version and pipeline tag are independent of retrieval completeness.\n" +
        "- Genome/catalogue protein files do not imply Atlas MGYP IDs. Preserve release, clustering identity and verified sequence mapping. Bulk archives are external downloads.\n" +
        "- Each item has `id`, `type`, `attributes`, and `relationships` — attributes are the actual metadata.\n" +
        "- Pagination via `page` and `page_size` params; default page_size is 25.\n" +
        "- Narrow queries by study accession (MGYS*), sample accession (SRS*/ERS*/MGYSS*), or biome slug.\n" +
        "- Biome slugs use colons as path separators: e.g. `root:Host-associated:Human:Digestive%20system`.\n" +
        "- Docs: https://www.ebi.ac.uk/metagenomics/api/docs/ — OpenAPI: /api/v1/schema/?format=openapi\n" +
        "- GOTCHA: a study re-run through a newer analysis pipeline version keeps ALL prior-version analyses\n" +
        "  in `/studies/{accession}/analyses` — mixing versions silently double-counts or skews taxonomy/\n" +
        "  functional aggregates. Always filter to one `pipeline_version` (e.g. `?pipeline_version=5.0`)\n" +
        "  before aggregating; do not assume the newest analysis is the only one returned.",
    endpoints: [
        ...proteinEndpoints,
        ...genomeEndpoints,
        // Studies
        {
            method: "GET",
            path: "/studies",
            summary: "List metagenomic studies (MGYS*)",
            description: "JSON:API — records in `.data[]`. Supports biome/experiment_type filters.",
            category: "studies",
            queryParams: [
                { name: "page_size", type: "number", required: false, description: "Items per page", default: 25 },
                { name: "page", type: "number", required: false, description: "Page number", default: 1 },
                { name: "biome_name", type: "string", required: false, description: "Filter by biome name" },
                { name: "study_id", type: "string", required: false, description: "Filter by study accession" },
                { name: "ordering", type: "string", required: false, description: "Sort field (e.g. '-last_update')" },
            ],
            featured: true,
            usageHint: "Large responses stage automatically; api.getAll uses itemsField:'data'.",
        },
        {
            method: "GET",
            path: "/studies/{accession}",
            summary: "Get a single study by accession (e.g. MGYS00005292)",
            category: "studies",
            pathParams: [
                { name: "accession", type: "string", required: true, description: "Study accession (MGYS...)" },
            ],
        },
        {
            method: "GET",
            path: "/studies/{accession}/samples",
            summary: "List samples for a study",
            category: "studies",
            pathParams: [
                { name: "accession", type: "string", required: true, description: "Study accession" },
            ],
            queryParams: [
                { name: "page_size", type: "number", required: false, description: "Items per page", default: 25 },
            ],
        },
        {
            method: "GET",
            path: "/studies/{accession}/analyses",
            summary: "List analyses performed on a study's runs",
            description:
                "Returns analyses from EVERY pipeline version this study has been run through. " +
                "Filter by `pipeline_version` before aggregating taxonomy/functional results — " +
                "unfiltered results silently mix e.g. v4.1 and v5.0 outputs for the same samples.",
            category: "studies",
            pathParams: [
                { name: "accession", type: "string", required: true, description: "Study accession" },
            ],
            queryParams: [
                { name: "pipeline_version", type: "string", required: false, description: "e.g. '5.0' — recommended to avoid mixing analysis versions" },
            ],
        },

        // Samples
        {
            method: "GET",
            path: "/samples",
            summary: "List samples across all studies",
            category: "samples",
            queryParams: [
                { name: "page_size", type: "number", required: false, description: "Items per page", default: 25 },
                { name: "biome_name", type: "string", required: false, description: "Filter by biome" },
                { name: "geo_loc_name", type: "string", required: false, description: "Filter by geographic location" },
            ],
            usageHint: "Large responses stage automatically; api.getAll uses itemsField:'data'.",
        },
        {
            method: "GET",
            path: "/samples/{accession}",
            summary: "Get a single sample by accession (e.g. SRS123456 / ERS123456)",
            category: "samples",
            pathParams: [
                { name: "accession", type: "string", required: true, description: "Sample accession (SRS*/ERS*/etc)" },
            ],
        },

        // Runs & analyses
        {
            method: "GET",
            path: "/runs/{accession}",
            summary: "Get a sequencing run (e.g. SRR*/ERR*)",
            category: "analyses",
            pathParams: [
                { name: "accession", type: "string", required: true, description: "Run accession" },
            ],
        },
        {
            method: "GET",
            path: "/analyses/{accession}",
            summary: "Get an MGnify analysis result (e.g. MGYA00123456)",
            description: "Includes pipeline version, analysis_status, and links to taxonomy/function downloads.",
            category: "analyses",
            pathParams: [
                { name: "accession", type: "string", required: true, description: "Analysis accession (MGYA...)" },
            ],
        },
        {
            method: "GET",
            path: "/analyses/{accession}/taxonomy",
            summary: "Get taxonomic assignment summary for an analysis",
            category: "analyses",
            pathParams: [
                { name: "accession", type: "string", required: true, description: "Analysis accession" },
            ],
        },

        // Biomes
        {
            method: "GET",
            path: "/biomes",
            summary: "List biomes in the MGnify hierarchy (root:Environmental:..., root:Host-associated:..., etc.)",
            category: "biomes",
            queryParams: [
                { name: "page_size", type: "number", required: false, description: "Items per page", default: 25 },
                { name: "depth_lte", type: "number", required: false, description: "Max hierarchy depth" },
                { name: "depth_gte", type: "number", required: false, description: "Min hierarchy depth" },
            ],
            usageHint: "Large responses stage automatically; api.getAll uses itemsField:'data'.",
        },
        {
            method: "GET",
            path: "/biomes/{lineage}",
            summary: "Get a biome by lineage slug (e.g. 'root:Host-associated:Human:Digestive%20system')",
            category: "biomes",
            pathParams: [
                { name: "lineage", type: "string", required: true, description: "URL-encoded biome lineage, colon-separated" },
            ],
        },

        // Publications / genomes
        {
            method: "GET",
            path: "/publications",
            summary: "List publications associated with MGnify studies",
            category: "publications",
            queryParams: [
                { name: "page_size", type: "number", required: false, description: "Items per page", default: 25 },
                { name: "pubmed_id", type: "string", required: false, description: "Filter by PubMed ID" },
            ],
            usageHint: "Large responses stage automatically; api.getAll uses itemsField:'data'.",
        },
    ],
};
