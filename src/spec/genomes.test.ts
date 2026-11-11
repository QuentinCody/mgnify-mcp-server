/// <reference types="node" />
import { runInNewContext } from "node:vm";
import { paginateAll } from "@bio-mcp/shared/codemode/paginate";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { afterEach, expect, it, vi } from "vitest";
import { createMgnifyApiFetch } from "../lib/api-adapter";
import { mgnifyCatalog } from "./catalog";
import { genomeWorkflows } from "./genomes";
afterEach(()=>vi.unstubAllGlobals());

it("executes the scoped recipe through the proxy without losing catalogue/quality context",async()=>{
  const urls: string[]=[];
  vi.stubGlobal("fetch",vi.fn(async(input:string)=>{
    urls.push(String(input));
    if(input.includes("/genomes?")) return Response.json({data:[{id:"MGYG000000001",attributes:{completeness:98.59,contamination:0.7}}],meta:{pagination:{count:4744}},links:{next:"?page=2"}});
    return Response.json({data:{id:"human-gut-v2-0-2",attributes:{version:"2.0.2","pipeline-version-tag":"v1.2.1","genome-count":4744,"unclustered-genome-count":289232}}});
  }));
  // SAFETY: small fixtures do not invoke staging or session capabilities.
  const proxy=createApiProxyTool({catalog:mgnifyCatalog,apiFetch:createMgnifyApiFetch(),doNamespace:{} as DurableObjectNamespace,stagingPrefix:"mgnify"});
  // SAFETY: bounded fixture reads require no ToolContext capabilities.
  const ctx={} as Parameters<typeof proxy.handler>[1];
  const api={get:(path:string,params:Record<string,unknown>)=>proxy.handler({method:"GET",path,params},ctx)};
  const r=await runInNewContext(`(async()=>{${genomeWorkflows[0].code}})()`,{api});
  expect(r.catalogue.data.attributes).toMatchObject({version:"2.0.2","pipeline-version-tag":"v1.2.1","unclustered-genome-count":289232});
  expect(r.genomes).toMatchObject({total_count:4744,next:"?page=2",data:[{attributes:{completeness:98.59,contamination:0.7}}]});
  expect(urls).toEqual(["https://www.ebi.ac.uk/metagenomics/api/v1/genome-catalogues/human-gut-v2-0-2","https://www.ebi.ac.uk/metagenomics/api/v1/genome-catalogues/human-gut-v2-0-2/genomes?page_size=2"]);
});

it("reports incomplete retrieval using nested JSON:API totals",async()=>{
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({data:[{id:"MGYG000000001"}],meta:{pagination:{count:4744}},links:{next:"?page=2"}})));
  const adapter=createMgnifyApiFetch();
  const page=await paginateAll(async params=>(await adapter({method:"GET",path:"/genomes",params})).data,{}, {strategy:"page",pageSize:1,pageSizeParam:"page_size",itemsField:"data",maxPages:1});
  expect(page.completeness).toMatchObject({complete:false,returned:1,total_available:4744});
});
