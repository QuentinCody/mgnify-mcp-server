import { afterEach, expect, it, vi } from "vitest";
import { createMgnifyApiFetch } from "./api-adapter";
afterEach(()=>vi.unstubAllGlobals());

it("uses accepted JSON negotiation and retains single-record provenance",async()=>{
  const data={data:{id:"MGYG000000001",attributes:{"ena-study-accession":"ERP105624"},relationships:{catalogue:{data:{id:"human-gut-v2-0-2"}}}}};
  const fetch=vi.fn().mockResolvedValue(Response.json(data));vi.stubGlobal("fetch",fetch);
  expect(await createMgnifyApiFetch()({method:"GET",path:"/genomes/MGYG000000001"})).toEqual({status:200,data});
  expect(fetch.mock.calls[0][1].headers.Accept).toBe("application/json");
});

it("returns bounded discovered text files but does not accept HTML as API records",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(new Response(">MGYG000000001_00001 ClsA\nMLSFLEYSAY\n",{headers:{"content-type":"application/octet-stream"}})).mockResolvedValueOnce(new Response("<html>error</html>")));
  const api=createMgnifyApiFetch();
  expect(await api({method:"GET",path:"/genomes/MGYG000000001/downloads/MGYG000000001.faa"})).toEqual({status:200,data:">MGYG000000001_00001 ClsA\nMLSFLEYSAY\n"});
  await expect(api({method:"GET",path:"/genomes"})).rejects.toThrow("Expected JSON");
});

it("refuses writes and compressed files before touching the network",async()=>{
  const fetch=vi.fn();vi.stubGlobal("fetch",fetch);
  const api=createMgnifyApiFetch();
  await expect(api({method:"POST",path:"/genomes"})).rejects.toThrow("GET reads only");
  await expect(api({method:"GET",path:"/genomes/MGYG000000001/downloads/data.tar.gz"})).rejects.toThrow("outside Code Mode");
  expect(fetch).not.toHaveBeenCalled();
});

it("retains provider error details and rejects malformed JSON",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(new Response("missing",{status:404})).mockResolvedValueOnce(new Response("broken",{headers:{"content-type":"application/json"}})));
  const api=createMgnifyApiFetch();
  await expect(api({method:"GET",path:"/genomes/missing"})).rejects.toMatchObject({status:404,data:"missing"});
  await expect(api({method:"GET",path:"/genomes"})).rejects.toThrow(SyntaxError);
});
