import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const MGNIFY_BASE = "https://www.ebi.ac.uk/metagenomics/api/v1";

export interface MgnifyFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    baseUrl?: string;
}

/**
 * Fetch from the MGnify (EBI metagenomics) JSON:API.
 */
export async function mgnifyFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: MgnifyFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? MGNIFY_BASE;
    const headers: Record<string, string> = {
        Accept: "application/vnd.api+json, application/json",
        ...(opts?.headers ?? {}),
    };

    return restFetch(baseUrl, path, params, {
        ...opts,
        headers,
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 3,
        timeout: opts?.timeout ?? 45_000,
        userAgent: "mgnify-mcp-server/1.0 (bio-mcp)",
    });
}
