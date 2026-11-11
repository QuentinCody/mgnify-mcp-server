import type { ApiEndpoint, ParamDef, WorkflowRecipe } from "@bio-mcp/shared/codemode/catalog";

const paging: ParamDef[] = [
  {name:"page",type:"number",required:false,description:"One-based page number"},
  {name:"page_size",type:"number",required:false,description:"Records per page; use bounded pages"},
];
const catalogueId: ParamDef[] = [{name:"catalogue_id",type:"string",required:true,description:"Versioned catalogue ID, e.g. human-gut-v2-0-2"}];
const accession: ParamDef[] = [{name:"accession",type:"string",required:true,description:"MGYG genome accession, e.g. MGYG000000001 (not a MGYP protein ID)"}];

export const genomeEndpoints: ApiEndpoint[] = [
  {method:"GET",path:"/genome-catalogues",category:"genome-catalogues",summary:"Discover genome/protein catalogues, releases, pipeline versions, representative and unclustered genome counts.",queryParams:paging,featured:true},
  {method:"GET",path:"/genome-catalogues/{catalogue_id}",category:"genome-catalogues",summary:"Read a versioned catalogue and its linked UHGP/protein files, biome and genome relations.",pathParams:catalogueId},
  {method:"GET",path:"/genome-catalogues/{catalogue_id}/genomes",category:"genome-catalogues",summary:"List genomes within one catalogue release, retaining assembly quality, taxonomy and sample/study identifiers.",pathParams:catalogueId,queryParams:paging,
    usageHint:"Prefer this scoped relation to an unfiltered /genomes listing. Keep catalogue ID/version and pipeline-version-tag with results; completeness/contamination are genome quality metrics, not retrieval completeness."},
  {method:"GET",path:"/genome-catalogues/{catalogue_id}/downloads",category:"genome-catalogues",summary:"Discover catalogue download metadata and provider checksums where present. This relation may omit protein archives; use protein-catalogue discovery for those.",pathParams:catalogueId,queryParams:paging},
  {method:"GET",path:"/genome-catalogues/{catalogue_id}/protein-catalogue",category:"protein-artifacts",summary:"Adapter operation: discover bulk protein archives from the provider-linked directory, preserving catalogue release and clustering identity.",pathParams:catalogueId,featured:true,
    usageHint:"Returns catalogue metadata and data:[{filename,url,catalogue_id,catalogue_version,cluster_identity_percent,checksum}], retaining native catalogue and directory observations with hashes. If the description directory is 404, recovery requires the same catalogue's explicit ftp-url and its actual protein_catalogue/ link; the original 404 remains recorded. Does not download archives. Null checksum means unknown. UHGP/genome protein names are not Atlas MGYP IDs; join only with a verified mapping or exact sequence match."},
  {method:"GET",path:"/genomes",category:"genomes",summary:"List genome representatives across catalogues with taxonomy, assembly quality and catalogue relationships.",queryParams:paging},
  {method:"GET",path:"/genomes/{accession}",category:"genomes",summary:"Read one genome's quality, taxonomic lineage, sample/study accessions and catalogue relationship.",pathParams:accession},
  {method:"GET",path:"/genomes/{accession}/downloads",category:"genomes",summary:"Discover genome FASTA, predicted CDS, GFF, InterProScan, eggNOG and pangenome download metadata.",pathParams:accession,queryParams:paging},
  {method:"GET",path:"/genomes/{accession}/downloads/{file}",category:"genome-files",summary:"Read a discovered uncompressed genome text file, bounded to 8MB; large text is automatically staged.",pathParams:[...accession,{name:"file",type:"string",required:true,description:"Exact download ID, e.g. MGYG000000001.faa; discover rather than guessing"}],
    usageHint:"Returns raw text, not JSON metadata. Compressed/oversized files require external bulk processing. Preserve catalogue release and file identity. Predicted CDS names such as MGYG000000001_00001 are not Atlas accessions."},
  ...([
    ["cogs","COG functional category counts"],
    ["kegg-module","KEGG module annotations and counts"],
    ["kegg-class","KEGG class annotations and counts"],
    ["antismash-genecluster","antiSMASH predicted biosynthetic gene clusters"],
  ] as const).map(([relation,summary]): ApiEndpoint => ({method:"GET",path:`/genomes/{accession}/${relation}`,category:"genome-annotations",summary:`Retrieve ${summary} for one genome. These are computational annotations, not experimental validation.`,pathParams:accession,queryParams:paging})),
];

export const genomeWorkflows: WorkflowRecipe[] = [
  {
    title:"Inspect a release-scoped UHGG genome sample",
    description:"Read UHGG v2.0.2 and two representative genomes with their quality metrics, taxonomy and sample/study links. Keep representative and unclustered counts distinct.",
    keywords:["UHGG","genome","quality","release","contamination"],
    code:'const catalogue_id="human-gut-v2-0-2"; const catalogue=await api.get("/genome-catalogues/{catalogue_id}",{catalogue_id}); const genomes=await api.get("/genome-catalogues/{catalogue_id}/genomes",{catalogue_id,page_size:2}); return {catalogue,genomes,interpretation:"A paginated sample, not every genome. Preserve catalogue version, pipeline tag and quality metrics."};',
  },
  {
    title:"Discover versioned UHGP artifacts for a sequence/structure workflow",
    description:"Read the provider-linked UHGP manifest, retaining the catalogue, release and clustering levels. Download and checksum selected archives externally; structure joins still require verified MGYP mapping or exact sequence identity.",
    keywords:["UHGP","protein","ESM","Atlas","cluster","sequence","artifact"],
    code:'return await api.get("/genome-catalogues/{catalogue_id}/protein-catalogue",{catalogue_id:"human-gut-v2-0-2"});',
  },
  {
    title:"Inspect genome CDS and functional download availability",
    description:"Retain the genome's catalogue relationship with its first download page. Choose exact advertised file IDs for bounded text retrieval or external processing.",
    keywords:["FASTA","CDS","InterProScan","eggNOG","genome"],
    code:'const accession="MGYG000000001"; const genome=await api.get("/genomes/{accession}",{accession}); const downloads=await api.get("/genomes/{accession}/downloads",{accession,page_size:20}); return {genome,downloads};',
  },
];
