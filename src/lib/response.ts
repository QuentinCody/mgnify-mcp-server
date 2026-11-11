import { decodeResponseText, readResponseBytes } from "@bio-mcp/shared/http/response-reader";

/** Bound decoded bodies before parsing JSON or staging a downloadable text file. */
export async function readMgnifyText(response: Response, maxBytes = 8_000_000, deadline = Date.now() + 30000): Promise<string> {
  if (!response.body) throw new Error("MGnify returned no body");
  try {
    return decodeResponseText(await readResponseBytes(response, { label: "MGnify", maxBytes, timeoutMs: deadline - Date.now() }), "MGnify");
  } catch (error) {
    if (error && typeof error === "object" && "status" in error) {
      if (error.status === 413) throw Object.assign(new Error("MGnify response exceeds the read budget; download the bulk artifact outside Code Mode"), { status: 413 });
      if (error.status === 504) throw Object.assign(new Error("MGnify response deadline exceeded"), { status: 504 });
    }
    throw error;
  }
}

/** Preserve complete bounded HTTP evidence; a failed read is not an empty page. */
export async function readMgnifyBody(response: Response, maxBytes = 8_000_000, deadline = Date.now() + 30000): Promise<string> {
  let text: string;
  try { text = await readMgnifyText(response, maxBytes, deadline); }
  catch (error) {
    if (!response.ok) throw Object.assign(new Error(`MGnify HTTP ${response.status}`), { status: response.status,
      data: { http_status: response.status, body_unavailable: true, body_error: error instanceof Error ? error.message : String(error) } });
    throw error;
  }
  if (!response.ok) {
    let data: unknown = text;
    try { data = JSON.parse(text.replace(/^\uFEFF/, "")); } catch { /* Retain non-JSON error evidence verbatim. */ }
    throw Object.assign(new Error(`MGnify HTTP ${response.status}`), { status: response.status, data });
  }
  return text;
}

/** Retain JSON:API metadata while exposing total/next to shared completeness checks. */
export function normalizeMgnifyPage(data: unknown): unknown {
  if (!data || typeof data !== "object" || !("data" in data) || !Array.isArray(data.data)) return data;
  const meta = "meta" in data ? data.meta : undefined;
  const pagination = meta && typeof meta === "object" && "pagination" in meta ? meta.pagination : undefined;
  const count = pagination && typeof pagination === "object" && "count" in pagination ? pagination.count : undefined;
  const links = "links" in data ? data.links : undefined;
  const next = links && typeof links === "object" && "next" in links ? links.next : undefined;
  return {...data, ...(typeof count === "number" && Number.isSafeInteger(count) && count >= 0 ? {total_count:count} : {}), ...(next === null || typeof next === "string" ? {next} : {})};
}
