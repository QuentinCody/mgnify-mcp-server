# mgnify-mcp-server

MCP server wrapping the [MGnify](https://www.ebi.ac.uk/metagenomics/) (EBI metagenomics) REST API — microbiome studies, samples, runs, analyses, and biome hierarchy.

- **Base URL**: `https://www.ebi.ac.uk/metagenomics/api/v1`
- **API docs**: https://www.ebi.ac.uk/metagenomics/api/docs/
- **Port** (dev): `8884`
- **Auth**: none (public)

All functionality is exposed through Code Mode: `mgnify_search` (discover endpoints) and `mgnify_execute` (run JavaScript in a V8 isolate). The main MGnify API returns JSON:API — records live under `.data[]`. Large responses auto-stage to `MGNIFY_DATA_DO`; query with `mgnify_query_data` and inspect schemas via `mgnify_get_schema`.

All four tools also expose `mcp_` aliases. Complete response envelopes above
30 KiB stage in the existing Durable Object; the returned citation hashes the
stored original response. SQL/schema responses use the same bounds.

## Proteins API

The [September 23 provider documentation](https://docs.mgnify.org/src/docs/mgnify-proteins-api.html)
describes a separate read-only service at
`https://www.ebi.ac.uk/metagenomics/proteins/api/v1`. Code Mode now routes
`/protein/search` and `/protein/{mgyp}` to that service:

```js
return await api.get('/protein/search', {
  biome_lineage: 'root:Engineered:Wastewater', limit: 3
});
```

Choose exactly one of `biome_id`, `biome_lineage` or `pfam_accession`. Search is a
capped exploration with no offset, pagination or total; do not use `api.getAll`.
The response retains the native list in `data` and source context in
`_mgnify_proteins`. `complete:false` also survives staging. The catalog includes
a bounded Pfam-to-sequence recipe.

Detail records preserve sequence, fragment/full-length flag, cluster size,
biomes, Pfam predictions and study/assembly/contig coordinates. Only cluster
representatives have detail records. Documented 302 replacements are followed
for at most three hops within this service, retaining requested/resolved IDs and
every redirect. This does not prove exact sequence identity across releases.
Reads have a 5 MB body limit and one 30-second header/body deadline; native JSON
error details remain failures. No structure coordinates or pinned data release
are inferred from API version v1. The portal's displayed database release is
separate from these API responses.

October 3 native acceptance (October 4 UTC receipts) verifies all three search
filters, PF00005/numeric Pfam spelling, sequences and nested annotations through
both aliases. The native lowercase and numeric MGYP examples return 404 despite the provider
guide; this adapter canonicalizes lowercase/numeric input to uppercase MGYP plus
twelve digits before fetching. Requested tool arguments and actual source URLs
remain distinct evidence. Representative replacement chains remain fixture-tested;
no live 302 was observed in the sampled identifiers.

A staged 1,000-protein search previously reported `complete:true` in its MCP
metadata despite the native cap. Coverage now stays incomplete through inline,
staged and composed programs, retaining source resource counts rather than SQL
child-row totals. Search, SQL, schema and failure outputs carry verifiable
citations; full-response staging cites its recoverable original envelope.
Native HTTP-error JSON/text survives Code Mode, including large bodies, instead
of becoming only a diagnostic message. Failed body reads preserve native status
and an explicit unavailable-body observation. Text decoding is strict UTF-8.

## Genome catalogues and protein artifacts

Discover `/genome-catalogues`, read a versioned catalogue, then follow its `/genomes` or
`/downloads` relation. `/genomes/{accession}` retains taxonomy, assembly quality and sample/study
identifiers; its `cogs`, `kegg-module`, `kegg-class` and `antismash-genecluster` relations expose
computational annotations. Preserve catalogue release and pipeline tag alongside genome IDs.

```js
const catalogue_id = 'human-gut-v2-0-2';
const catalogue = await api.get('/genome-catalogues/{catalogue_id}', {catalogue_id});
const genomes = await api.getAll('/genome-catalogues/{catalogue_id}/genomes',
  {catalogue_id}, {strategy:'page', pageSize:2, pageSizeParam:'page_size',
    itemsField:'data', maxPages:2});
return {catalogue, genomes}; // Inspect retrieval completeness before counting.
```

The adapter preserves `meta.pagination`/`links` and adds `total_count`/`next` so shared pagination
and staging can report incomplete retrieval. Genome assembly completeness and contamination are
different metrics. Use `Accept: application/json`; the provider rejects a sole JSON:API media type.

`/genome-catalogues/{catalogue_id}/protein-catalogue` is an adapter operation that reads the
provider-linked protein directory and returns a file manifest. UHGP v2.0.2 exposes 50/90/95/100%
clustering archives. The manifest retains catalogue/version, source directory, identity level and
file URL; unknown checksums remain null. The ordinary catalogue download relation may not list
these protein files. Download/checksum large archives outside Code Mode.
Discovery accepts the provider's HTTP/HTTPS links and optional trailing slash,
retaining the advertised URL while reading the same EBI directory over HTTPS.
Ambiguous directory links require review rather than arbitrary selection.
If the description link returns 404, recovery requires the same catalogue's
explicit `ftp-url` and an actual `protein_catalogue/` entry in that directory.
The native mouse-gut v1.0 description links to a stale `mouse_gut` path; its
separate `ftp-url` links to the working `mouse-gut` release. All attempted
directory statuses and decoded bodies remain in `_mgnify_catalogue`, alongside
the complete native catalogue and canonical JSON hashes. This is bounded to
three directory reads within the catalogue helper's 45-second budget. The
observed mouse-gut archive names carry 50/90/95/100 clustering labels; archive
contents and checksums remain unverified.

Genome `/downloads` lists exact file IDs. `/genomes/{accession}/downloads/{file}` reads discovered
uncompressed FASTA/annotation text up to 8MB; larger results stage automatically. Predicted CDS
names such as `MGYG000000001_00001` are not ESM Atlas `MGYP` accessions. A structure join requires
a verified mapping or exact sequence match, preserving both releases and clustering level.
The [local sequence-join workflow](../../docs/workflows/mgnify-atlas-sequence-join.md) streams
extracted UHGP and Atlas FASTA through a disk-backed exact join, retaining release labels,
input hashes, multiple matches and explicit unmatched/excluded rows. Never substitute a cluster
representative for an identical sequence without checking it. Atlas structures are predictions.

## October 3 acceptance (October 4 UTC receipts)

Completed **2,284 local MCP calls**, with **2,266 inline / 18 reconstructed staged
citation proofs**. Maximum structured/whole envelopes were **14,921 / 19,430 bytes**.
Nineteen native query cases, human-gut/marine/mouse-gut artifact discovery, all four
recipes and native 404/422 bodies pass through both aliases. The published
`MGYG000000001.faa` is recovered exactly: **1,078,776 bytes / 3,182 CDS entries**.
This is a bounded genome file, not a downloaded UHGP archive or a verified Atlas join.

Large native representatives `MGYP000000000101` and `MGYP000000000012` retain
their full records, sequences, **1,167 / 544** contig observations and every biome
and Pfam annotation through SQLite. Child rows retain their parent links. Their
native `cluster_size: 1` is separate from those observation counts. Singletons,
native JSON:API pages and SQL results now have explicit projections; full source
envelopes remain recoverable from `payloads` / `content_chunks`. SQL responses
above the inline threshold stage without `_rowid` collisions. The handler still
defaults to 100 rows without altering signed caller arguments.

**70 focused tests**, **13 static checks**, TypeScript, lint and dry bundle pass.
Full Vitest passes **13,375 tests / 109 skipped**; `check:affected` completes
**exit 0**, including **13,373 selected tests / 73 skipped**. An initial full run
timed out in an existing MetaboLights concurrency test; its focused retry and the
subsequent full run pass. A final fixture-import type cleanup was rechecked with
focused tests and TypeScript. The live contract harness passes nine checks; its
small-seed staging probe skips, covered by dedicated reconstruction tests.

Native protein release snapshots, positive replacement redirects, bulk archive
integrity and exact UHGP/Atlas matches remain unverified. No credential, backend,
shared-package source change, commit, push or deployment was performed. Receipts
and reproducible scripts are in `scratch/2026-10-03-mgnify/` and `/tmp/mgnify-*`;
see the implementation tracker for manual scan findings and remaining scope.

<!-- license-and-data-terms:start -->
## License and data terms

The code in this repository is licensed under the Apache License 2.0 (see `LICENSE`).
If you use it in your work, please cite it (see `CITATION.cff`). Citation is requested, not required.

The license covers the code only. Data that this server returns comes from MGnify and stays under the terms of that source: EMBL-EBI terms.
You are responsible for your use of the data under those terms.
<!-- license-and-data-terms:end -->
