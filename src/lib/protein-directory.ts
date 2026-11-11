import { hashCanonicalJson } from "@bio-mcp/shared";
import { readMgnifyText } from "./response";

function directoryUrl(value: string): URL {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.hostname !== "ftp.ebi.ac.uk" || url.port || url.username || url.password || url.search || url.hash ||
    !/^\/pub\/databases\/metagenomics\/mgnify_genomes\/[A-Za-z0-9_./-]+$/.test(url.pathname)) throw new Error("Invalid protein catalogue directory");
  url.protocol = "https:";
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

async function observe(url: URL, deadline: number) {
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw Object.assign(new Error("MGnify protein directory deadline exceeded"), { status: 504 });
  const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(Math.min(30_000, remaining)) });
  let text: string;
  try { text = await readMgnifyText(response, 500_000, deadline); }
  catch (error) {
    throw Object.assign(new Error(`MGnify directory body unavailable (HTTP ${response.status})`), { status: response.ok ? 502 : response.status,
      data: { source_url: url.href, http_status: response.status, body_unavailable: true, body_error: error instanceof Error ? error.message : String(error) } });
  }
  return { source_url: url.href, status: response.status, text, text_sha256: await hashCanonicalJson(text) };
}

/** Recover a stale description link only through the same native catalogue's explicit FTP link and directory entry. */
export async function proteinDirectory(advertised: string, ftpUrl: unknown, deadline: number) {
  let directory = directoryUrl(advertised);
  let observation = await observe(directory, deadline);
  const observations = [observation];
  const fail = (message: string, status: number): never => { throw Object.assign(new Error(message), { status, data: { phase: "protein_directory", observations } }); };
  if (observation.status === 404 && typeof ftpUrl === "string") {
    const root = directoryUrl(ftpUrl);
    if (root.href === directory.href) fail("MGnify protein directory HTTP 404", 404);
    observation = await observe(root, deadline); observations.push(observation);
    if (observation.status !== 200) fail(`MGnify catalogue FTP directory HTTP ${observation.status}`, observation.status);
    if (!/href="protein_catalogue\/"/.test(observation.text)) fail("Catalogue FTP listing does not link a protein_catalogue directory", 502);
    directory = new URL("protein_catalogue/", root);
    observation = await observe(directory, deadline); observations.push(observation);
  }
  if (observation.status !== 200) fail(`MGnify protein directory HTTP ${observation.status}`, observation.status);
  return { directory, html: observation.text, observations,
    resolution: observations.length === 1 ? "description_link" : "catalogue_ftp_link_after_description_404" };
}
