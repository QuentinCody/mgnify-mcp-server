import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class MgnifyDataDO extends RestStagingDO {
    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        const obj = data as Record<string, unknown>;

        // JSON:API envelope: { data: [...], meta, links }
        if (Array.isArray(obj.data)) {
            const sample = obj.data[0];
            if (sample && typeof sample === "object") {
                const sampleObj = sample as Record<string, unknown>;
                const t = typeof sampleObj.type === "string" ? (sampleObj.type as string) : "records";
                return {
                    tableName: t,
                    indexes: ["id", "type"],
                };
            }
        }

        // Single JSON:API object: { data: {...} }
        if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
            const sampleObj = obj.data as Record<string, unknown>;
            const t = typeof sampleObj.type === "string" ? (sampleObj.type as string) : "record";
            return {
                tableName: t,
                indexes: ["id"],
            };
        }

        return undefined;
    }
}
