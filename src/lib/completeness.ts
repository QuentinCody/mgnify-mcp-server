import type { Completeness } from "@bio-mcp/shared";
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

function direct(data: Record<string, unknown>): Completeness | undefined {
  if (record(data._mgnify_proteins) && data._mgnify_proteins.pagination === "unsupported") return {
    complete: false, returned: Array.isArray(data.data) ? data.data.length : Number(data._mgnify_proteins.returned),
    truncation: { reason: "page_limit", detail: "A capped exploration of protein cluster representatives; the provider supplies no pagination or total.",
      remedy: "Retain the native sample and its limit. Use documented bulk data for exhaustive work; empty samples do not establish protein absence." },
  };
  if (record(data.meta) && record(data.meta.pagination)) {
    const total = data.meta.pagination.count;
    return { complete: false, ...(Array.isArray(data.data) ? { returned: data.data.length } : {}),
      ...(typeof total === "number" && Number.isSafeInteger(total) && total >= 0 ? { total_available: total } : {}),
      truncation: { reason: record(data.links) && data.links.next ? "page_limit" : "unknown",
        detail: "One native JSON:API page; totals count resource records, not nested annotation or SQL rows.",
        remedy: "Retain native links, page metadata and catalogue/pipeline versions. Separate live reads are not an atomic snapshot." } };
  }
  if (typeof data.source_directory === "string" && Array.isArray(data.data)) return { complete: false, returned: data.data.length,
    truncation: { reason: "unknown", detail: "Supported filenames discovered in one provider-linked directory; asset bytes and checksums are unverified.",
      remedy: "Retain the native catalogue and listing evidence. File count is not genome or protein coverage." } };
  return undefined;
}

/** Keep source coverage limits through direct, staged and composed programs. */
export function mgnifyCompleteness(value: unknown): Completeness | undefined {
  const pending = [value]; const observations: Completeness[] = [];
  while (pending.length) {
    const item = pending.pop();
    if (!item || typeof item !== "object") continue;
    const coverage = record(item) ? direct(item) : undefined;
    if (coverage) observations.push(coverage);
    else if (record(item) && item.__staged === true) {
      if (record(item._staging) && record(item._staging.completeness) && item._staging.completeness.complete === false)
        observations.push({ ...item._staging.completeness, complete: false });
    } else pending.push(...Object.values(item));
  }
  if (observations.length < 2) return observations[0];
  return { complete: false, truncation: { reason: "unknown", detail: "Composed MGnify evidence includes multiple independently bounded observations.",
    remedy: "Keep each native source's pagination, sample limits, release identifiers and count semantics separately." } };
}
