import { hashCanonicalJson } from "@bio-mcp/shared";
import { proteinId, proteinRequest, replacementUrl } from "./protein-request";
import { readMgnifyBody } from "./response";

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

/** Read native protein records; retain representative changes and explicit search caps. */
export async function readProtein(path: string, input?: Record<string, unknown>) {
  const request = proteinRequest(path, input);
  const deadline = Date.now() + 30000;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error("MGnify Proteins deadline exceeded"), { status: 504,
      data: { source_url: request.url.href, body_unavailable: true, upstream_http_status: null } })); }, 30000);
  });
  const redirects: Array<{ from: string; location: string; to: string }> = [];
  const seen = new Set<string>();
  let url = request.url;
  try {
    while (true) {
      if (seen.has(url.href)) throw new Error("MGnify replacement cycle");
      seen.add(url.href);
      const response = await Promise.race([fetch(url, { headers: { Accept: "application/json" }, redirect: "manual", signal: controller.signal }), timeout]);
      if (response.status === 302) {
        void response.body?.cancel().catch(() => undefined);
        if (request.search || redirects.length >= 3) throw new Error("Unexpected or excessive MGnify protein replacements");
        const location = response.headers.get("location");
        const next = replacementUrl(location, url);
        redirects.push({ from: url.href, location: location!, to: next.href });
        url = next;
        continue;
      }
      return await readProteinEvidence(response, deadline, timeout, request, url, redirects);
    }
  } finally { clearTimeout(timer); controller.abort(); }
}

async function readProteinEvidence(response: Response, deadline: number, timeout: Promise<never>, request: { url: URL; search: false; requestedId: string; params: Record<string, unknown>; } | { url: URL; search: true; requestedId: null; params: Record<string, unknown>; }, url: URL, redirects: { from: string; location: string; to: string; }[]) {
  const text = await Promise.race([readMgnifyBody(response, 5000000, deadline), timeout]);
  let native: unknown;
  try { native = JSON.parse(text.replace(/^\uFEFF/, "")); } catch {
    throw Object.assign(new Error(`MGnify Proteins HTTP ${response.status}: expected JSON`), { status: response.ok ? 502 : response.status, data: text });
  }
  if (response.status !== 200) throw Object.assign(new Error(`MGnify Proteins HTTP ${response.status}`), { status: response.status, data: native });
  validateNative(native, request.search, url, Number(request.params.limit));
  return {
    data: native, ...(request.search ? { complete: false, pagination: "unsupported" } : {}), _mgnify_proteins: {
      source_url: url.href, requested_url: request.url.href, retrieved_at: new Date().toISOString(),
      native_sha256: await hashCanonicalJson(native), hash_scope: "canonical native JSON", api_version: "v1", release_pinned: false,
      requested_mgyp: request.requestedId, resolved_mgyp: object(native) ? native.mgyp : null, redirects,
      ...(request.search ? {
        returned: (native as unknown[]).length, requested_limit: request.params.limit, complete: false,
        pagination: "unsupported", interpretation: "A capped exploration of cluster representatives, not an exhaustive protein census. No total is supplied."
      } :
        { interpretation: "Cluster representative and predicted annotations. A replacement MGYP is explicit in redirects; it does not establish identical sequences across releases. No structure coordinates are returned." }),
    }
  };
}

function validateNative(native: unknown, search: boolean, url: URL, limit: number): void {
  if (search) {
    if (!Array.isArray(native) || native.length > limit || native.some(row => !object(row) || typeof row.mgyp !== "string" || !/^MGYP\d{12}$/.test(row.mgyp))) throw new Error("Unrecognized MGnify protein search response");
    return;
  }
  const expected = proteinId(url.pathname.split("/").pop()!);
  if (!object(native) || native.mgyp !== expected || typeof native.sequence !== "string" || !native.sequence.length) throw new Error("MGnify protein record does not match the requested representative");
}
