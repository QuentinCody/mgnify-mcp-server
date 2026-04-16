# mgnify-mcp-server

MCP server wrapping the [MGnify](https://www.ebi.ac.uk/metagenomics/) (EBI metagenomics) REST API — microbiome studies, samples, runs, analyses, and biome hierarchy.

- **Base URL**: `https://www.ebi.ac.uk/metagenomics/api/v1`
- **API docs**: https://www.ebi.ac.uk/metagenomics/api/docs/
- **Port** (dev): `8884`
- **Auth**: none (public)

All functionality is exposed through Code Mode: `mgnify_search` (discover endpoints) and `mgnify_execute` (run JavaScript in a V8 isolate). MGnify returns JSON:API — records live under `.data[]`. When staging, use `record_path: 'data'` to flatten the envelope. Large responses auto-stage to `MGNIFY_DATA_DO`; query with `mgnify_query_data` and inspect schemas via `mgnify_get_schema`.
