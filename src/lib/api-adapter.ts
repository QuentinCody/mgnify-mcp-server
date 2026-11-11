import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { mgnifyFetch } from "./http";
import { normalizeMgnifyPage, readMgnifyBody } from "./response";
import { proteinCatalogue } from "./protein-catalogue";
import { readProtein } from "./proteins";
import { mgnifyCompleteness } from "./completeness";

export function createMgnifyApiFetch(): ApiFetchFn {
    return async (request) => {
        if (request.method.toUpperCase() !== "GET" || request.body !== undefined) throw Object.assign(new Error("MGnify supports GET reads only, without a body"), { status: 405 });
        if (request.path.startsWith("/protein/")) return result(await readProtein(request.path, request.params));
        const protein = request.path.match(/^\/genome-catalogues\/([^/]+)\/protein-catalogue$/);
        if (protein) {
            if (Object.keys(request.params ?? {}).length) throw Object.assign(new Error("Protein catalogue discovery does not accept query parameters"), { status: 400 });
            return result(await proteinCatalogue(decodeURIComponent(protein[1])));
        }
        if (/\/downloads\/.*\.(?:gz|zip|tar)(?:\?|$)/i.test(request.path)) throw new Error("Download compressed bulk artifacts outside Code Mode");
        const deadline = Date.now() + 45_000;
        const response = await mgnifyFetch(request.path, request.params, { timeout: 15_000, deadlineMs: 45_000 });
        const text = await readMgnifyBody(response, 8_000_000, deadline);
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("json")) {
            if (!request.path.includes("/downloads/")) throw Object.assign(new Error("Expected JSON from MGnify"), { status: 502, data: text });
            return { status: response.status, data: text };
        }
        let data: unknown;
        try { data = normalizeMgnifyPage(JSON.parse(text.replace(/^\uFEFF/, ""))); }
        catch (error) { throw Object.assign(error instanceof Error ? error : new Error("Invalid MGnify JSON"), { status: 502, data: text }); }
        return result(data, response.status);
    };
}

function result(data: unknown, status = 200) {
    const completeness = mgnifyCompleteness(data);
    return { status, data, ...(completeness ? { completeness, upstreamTotal: completeness.total_available ?? null } : {}) };
}
