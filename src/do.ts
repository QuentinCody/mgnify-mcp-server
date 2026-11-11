import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);

export class MgnifyDataDO extends RestStagingDO {
  protected getTabularData(value: unknown): unknown {
    const data = record(value) && Array.isArray(value.content) && record(value.structuredContent) && "data" in value.structuredContent
      ? value.structuredContent.data : value;
    if (!record(data)) return data;
    if (typeof data.sql === "string" && Array.isArray(data.rows)) return { query_rows: data.rows.map(native => ({ native })) };
    if (record(data._mgnify_proteins)) return { proteins: Array.isArray(data.data) ? data.data : [data.data] };
    if (typeof data.source_directory === "string" && Array.isArray(data.data)) return { protein_files: data.data };
    const rows = Array.isArray(data.data) ? data.data : record(data.data) ? [data.data] : undefined;
    if (!rows?.length) return data;
    const sample = rows[0];
    const type = record(sample) && typeof sample.type === "string" && /^[a-z][a-z0-9_-]*$/.test(sample.type) ? sample.type : "records";
    return { [type]: rows };
  }
}
