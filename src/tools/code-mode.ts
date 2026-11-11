import type { McpServer } from "@bio-mcp/shared/mcp";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { mgnifyCatalog } from "../spec/catalog";
import { createMgnifyApiFetch } from "../lib/api-adapter";
import { mgnifyResponse } from "../lib/tool-result";

interface CodeModeEnv {
    MGNIFY_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(
    server: McpServer,
    env: CodeModeEnv,
): void {
    const apiFetch = createMgnifyApiFetch();
    const registrar = { tool: (...args: unknown[]) => {
        const [name, ...rest] = args;
        // SAFETY: shared factories supply SDK registration arguments and handlers.
        const handler = rest.pop() as (input: unknown, extra: unknown) => ReturnType<typeof mgnifyResponse>;
        const respond = (input: unknown, extra: unknown) => mgnifyResponse(() => handler(input, extra), env, String(name), extra, input);
        const register = server.tool.bind(server) as (...values: unknown[]) => void;
        register(name, ...rest, respond);
        register(`mcp_${String(name)}`, ...rest, respond);
    } };

    const searchTool = createSearchTool({
        prefix: "mgnify",
        catalog: mgnifyCatalog,
    });
    searchTool.register(registrar);

    const executeTool = createExecuteTool({
        prefix: "mgnify",
        // Verifiable provenance: mgnify_execute results carry a _meta.citation.
        source: { id: "mgnify", name: "MGnify", url: "https://www.ebi.ac.uk/metagenomics" },
        catalog: mgnifyCatalog,
        apiFetch,
        maxInlineBytes: 30 * 1024,
        stagingThreshold: 30 * 1024,
        doNamespace: env.MGNIFY_DATA_DO,
        loader: env.CODE_MODE_LOADER,
        preserveApiErrors: true,
    });
    executeTool.register(registrar);
}
