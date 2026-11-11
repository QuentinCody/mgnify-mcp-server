import { afterEach, expect, it, vi } from "vitest";
import { proteinCatalogue } from "./protein-catalogue";
afterEach(() => vi.unstubAllGlobals());
const directory = "https://ftp.ebi.ac.uk/pub/databases/metagenomics/mgnify_genomes/human-gut/v2.0.2/protein_catalogue/";
const catalogue = {id:"human-gut-v2-0-2",attributes:{version:"2.0.2","pipeline-version-tag":"v1.2.1","protein-catalogue-description":`Files at ${directory}`}};

it("discovers linked files with release/clustering provenance without downloading archives", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({data:catalogue})).mockResolvedValueOnce(new Response('<a href="uhgp-50.tar.gz">50</a><a href="uhgp-100.tar.gz">100</a><a href="uhgp-50.tar.gz">duplicate</a><a href="https://evil.invalid/archive.tar.gz">external</a>'));
  vi.stubGlobal("fetch",fetch);
  expect(await proteinCatalogue("human-gut-v2-0-2")).toMatchObject({catalogue,total_count:2,data:[{filename:"uhgp-50.tar.gz",catalogue_version:"2.0.2",cluster_identity_percent:"50",checksum:null},{filename:"uhgp-100.tar.gz",url:directory+"uhgp-100.tar.gz",cluster_identity_percent:"100"}]});
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(String(fetch.mock.calls[1][0])).toBe(directory);
  expect(fetch.mock.calls[1][1].redirect).toBe("manual");
});

it("does not fabricate files or follow untrusted directory links", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({data:{...catalogue,attributes:{version:"2.0.2","protein-catalogue-description":"https://evil.invalid/protein_catalogue/"}}}));
  vi.stubGlobal("fetch",fetch);
  await expect(proteinCatalogue(catalogue.id)).rejects.toThrow("does not supply");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("preserves catalogue errors and refuses empty artifact listings", async () => {
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(new Response("missing",{status:404})).mockResolvedValueOnce(Response.json({data:catalogue})).mockResolvedValueOnce(new Response("<html></html>")));
  await expect(proteinCatalogue("missing")).rejects.toMatchObject({status:404});
  await expect(proteinCatalogue("human-gut-v2-0-2")).rejects.toThrow("No supported protein artifacts");
});

it("rejects directory redirects instead of following them to another host", async () => {
  const fetch=vi.fn().mockResolvedValueOnce(Response.json({data:catalogue})).mockResolvedValueOnce(new Response(null,{status:302,headers:{location:"https://evil.invalid/"}}));
  vi.stubGlobal("fetch",fetch);
  await expect(proteinCatalogue("human-gut-v2-0-2")).rejects.toMatchObject({status:302});
  expect(fetch).toHaveBeenCalledTimes(2);
});

it.each([
  "http://ftp.ebi.ac.uk/pub/databases/metagenomics/mgnify_genomes/marine/v2.0/protein_catalogue",
  "http://ftp.ebi.ac.uk/pub/databases/metagenomics/mgnify_genomes/mouse_gut/v1.0/",
])("supports the provider's alternate directory spelling %s while retaining it", async advertised => {
  const fetch = vi.fn().mockResolvedValueOnce(Response.json({ data: { ...catalogue, attributes: { ...catalogue.attributes, "protein-catalogue-description": `Files at [FTP](${advertised})` } } })).mockResolvedValueOnce(new Response('<a href="proteins.faa.gz">proteins</a>'));
  vi.stubGlobal("fetch", fetch);
  const source = advertised.replace("http:", "https:").replace(/\/?$/, "/");
  expect(await proteinCatalogue(catalogue.id)).toMatchObject({ advertised_directory: advertised, source_directory: source, data: [{ url: `${source}proteins.faa.gz`, cluster_identity_percent: null }] });
  expect(String(fetch.mock.calls[1][0])).toBe(source);
});

it("rejects ambiguous advertised directories rather than selecting a release arbitrarily", async () => {
  const fetch = vi.fn(async () => Response.json({ data: { ...catalogue, attributes: { ...catalogue.attributes, "protein-catalogue-description": `${directory} and ${directory.replace("v2.0.2", "v1.0")}` } } }));
  vi.stubGlobal("fetch", fetch);
  await expect(proteinCatalogue(catalogue.id)).rejects.toThrow("one supported"); expect(fetch).toHaveBeenCalledTimes(1);
});

it("rejects a different catalogue identity with its complete native evidence", async () => {
  const native = { data: catalogue, extra: "source extension" };
  const fetch = vi.fn(async () => Response.json(native)); vi.stubGlobal("fetch", fetch);
  await expect(proteinCatalogue("different-v1-0")).rejects.toMatchObject({ status: 502, data: native });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("recovers the native mouse-gut stale link only via its separate FTP attribute and real protein directory entry", async () => {
  const advertised = "http://ftp.ebi.ac.uk/pub/databases/metagenomics/mgnify_genomes/mouse_gut/v1.0/";
  const root = "http://ftp.ebi.ac.uk/pub/databases/metagenomics/mgnify_genomes/mouse-gut/v1.0";
  const native = { data: { id: "mouse-gut-v1-0", attributes: { version: "1.0", "protein-catalogue-description": advertised, "ftp-url": root } }, native_extension: [1, null] };
  const failure = "<html>source directory not found</html>";
  const rootHtml = '<a href="protein_catalogue/">proteins</a>';
  const html = '<a href="protein_catalogue-50.tar.gz">50</a>';
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(native)).mockResolvedValueOnce(new Response(failure, { status: 404 }))
    .mockResolvedValueOnce(new Response(rootHtml)).mockResolvedValueOnce(new Response(html));
  vi.stubGlobal("fetch", fetch);
  const result = await proteinCatalogue(native.data.id);
  expect(result).toMatchObject({ advertised_directory: advertised, source_directory: root.replace("http:", "https:") + "/protein_catalogue/",
    data: [{ filename: "protein_catalogue-50.tar.gz", catalogue_version: "1.0", cluster_identity_percent: "50", checksum: null }],
    _mgnify_catalogue: { native_response: native, directory_resolution: "catalogue_ftp_link_after_description_404",
      directory_observations: [{ status: 404, text: failure }, { status: 200, text: rootHtml }, { status: 200, text: html }] } });
  expect(fetch.mock.calls).toHaveLength(4);
});

it.each([false, true])("does not invent a recovery link or follow an external FTP attribute (external=%s)", async external => {
  const root = external ? "https://other.invalid/" : directory.replace("protein_catalogue/", "");
  const native = { data: { ...catalogue, attributes: { ...catalogue.attributes, "ftp-url": root } } };
  const fetch = vi.fn().mockResolvedValueOnce(Response.json(native)).mockResolvedValueOnce(new Response("missing", { status: 404 })).mockResolvedValueOnce(new Response('<a href="other/">other</a>'));
  vi.stubGlobal("fetch", fetch);
  await expect(proteinCatalogue(catalogue.id)).rejects.toThrow(external ? "Invalid protein catalogue directory" : "does not link");
  expect(fetch).toHaveBeenCalledTimes(external ? 2 : 3);
});
