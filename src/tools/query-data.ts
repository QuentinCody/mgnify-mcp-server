import type { McpServer } from "@bio-mcp/shared/mcp";
import { z } from "zod";
import { mgnifyResponse } from "../lib/tool-result";
import { createQueryDataHandler } from "@bio-mcp/shared/staging/utils";

interface QueryEnv {
    MGNIFY_DATA_DO?: unknown;
}

export function registerQueryData(server: McpServer, env?: QueryEnv): void {
    const handler = createQueryDataHandler("MGNIFY_DATA_DO", "mgnify");

    for (const name of ["mgnify_query_data", "mcp_mgnify_query_data"]) server.registerTool(
        name,
        {
            title: "Query Staged MGnify Data",
            description:
                "Query staged MGnify data using SQL. Use this when responses are too large and have been staged with a data_access_id.",
            inputSchema: {
                data_access_id: z.string().min(1).describe("Data access ID for the staged dataset"),
                sql: z.string().min(1).describe("SQL query to execute against the staged data"),
                limit: z.number().int().positive().max(10000).optional().describe("Maximum number of rows to return (default: 100)"),
            },
        },
        async (args, extra) => {
            const runtimeEnv = env || (extra as { env?: QueryEnv })?.env || {};
            return mgnifyResponse(() => handler(args as Record<string, unknown>, runtimeEnv as Record<string, unknown>), runtimeEnv, name, extra, args);
        },
    );
}
