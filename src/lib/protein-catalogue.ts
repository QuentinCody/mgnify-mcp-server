import { z } from "zod";
import { hashCanonicalJson } from "@bio-mcp/shared";
import { mgnifyFetch } from "./http";
import { readMgnifyBody } from "./response";
import { proteinDirectory } from "./protein-directory";

const catalogueSchema = z.object({data:z.object({id:z.string(), attributes:z.object({
  version:z.string(), "protein-catalogue-description":z.string(),
}).passthrough()}).passthrough()});

/** Discover only provider-linked bulk files; never infer MGYP identity from UHGP IDs. */
export async function proteinCatalogue(catalogueId: string): Promise<unknown> {
  const deadline = Date.now() + 45_000;
  const response = await mgnifyFetch(`/genome-catalogues/${encodeURIComponent(catalogueId)}`, undefined, { timeout: 15_000, deadlineMs: 45_000 });
  const text = await readMgnifyBody(response, 8_000_000, deadline);
  let native: unknown;
  try { native = JSON.parse(text.replace(/^\uFEFF/, "")); }
  catch { throw Object.assign(new Error("MGnify catalogue returned invalid JSON"), { status: 502, data: text }); }
  const {data:catalogue} = catalogueSchema.parse(native);
  if (catalogue.id !== catalogueId) throw Object.assign(new Error("MGnify returned a different catalogue identity"), { status: 502, data: native });
  const description = catalogue.attributes["protein-catalogue-description"];
  const links = [...new Set(description.match(/https?:\/\/ftp\.ebi\.ac\.uk\/pub\/databases\/metagenomics\/mgnify_genomes\/[A-Za-z0-9_./-]+/g) ?? [])];
  if (links.length !== 1) throw new Error("This catalogue does not supply one supported protein-catalogue directory");
  const linked = links[0];
  let listing: Awaited<ReturnType<typeof proteinDirectory>>;
  try { listing = await proteinDirectory(linked, catalogue.attributes["ftp-url"], deadline); }
  catch (error) {
    if (error instanceof Error) Object.assign(error, { data: { native_response: native, directory_error: "data" in error ? error.data : error.message } });
    throw error;
  }
  const { directory, html } = listing;
  const filenames = [...new Set([...html.matchAll(/href="([A-Za-z0-9][A-Za-z0-9_.-]*\.(?:tar\.gz|fasta\.gz|faa\.gz|tsv\.gz))"/g)].map(match=>match[1]))];
  if (!filenames.length) throw new Error("No supported protein artifacts found in the linked directory");
  const data = filenames.map(filename => ({
    filename, url:new URL(filename,directory).href,
    catalogue_id:catalogue.id, catalogue_version:catalogue.attributes.version,
    cluster_identity_percent:filename.match(/^(?:uhgp|protein_catalogue)-(50|90|95|100)\.tar\.gz$/)?.[1] ?? null,
    checksum:null,
  }));
  return {catalogue, advertised_directory:linked, source_directory:directory.href, data, total_count:data.length,
    _mgnify_catalogue: { native_response: native, native_sha256: await hashCanonicalJson(native),
      directory_html: html, directory_sha256: await hashCanonicalJson(html), retrieved_at: new Date().toISOString(),
      directory_observations: listing.observations, directory_resolution: listing.resolution,
      hash_scope: "canonical JSON of the native response or directory_html string; not archive bytes or immutable releases" },
    interpretation:"Bulk artifacts, not model predictions. Preserve clustering level and release. UHGP/genome protein IDs are not Atlas MGYP IDs; require a verified mapping or exact sequence match before joining. Checksums are unknown until obtained from the provider or computed after download."};
}
