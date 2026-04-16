import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { mgnifyCatalog } from "../spec/catalog";
import { createMgnifyApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
    MGNIFY_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createMgnifyApiFetch();

    const searchTool = createSearchTool({
        prefix: "mgnify",
        catalog: mgnifyCatalog,
    });
    searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

    const executeTool = createExecuteTool({
        prefix: "mgnify",
        catalog: mgnifyCatalog,
        apiFetch,
        doNamespace: env.MGNIFY_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
