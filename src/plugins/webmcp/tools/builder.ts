/**
 * @file src/plugins/webmcp/tools/builder.ts
 * @description Client-safe WebMCP builder tool (browser `document.modelContext` bridge).
 *
 * Registers the `design_collection` tool with the browser's `document.modelContext`
 * and proxies it to `/api/ai-builder/design-collection`. This module is imported
 * from `@src/plugins/webmcp/init.ts`, which `+layout.svelte` pulls into the CLIENT
 * graph, so it must stay free of server-only imports.
 *
 * The headless (server) builder tools — `design_collection`, `refine_collection`,
 * `diff_collection_schema`, `scaffold_widget`, `list_available_widgets` — live in
 * `./builder.server.ts` (they import `*.server.ts` services and Node builtins) and
 * are registered from a server-only entry point.
 *
 * ### Features:
 * - Browser modelContext registration for external AI agents
 * - CSRF-aware request via `fetchApi`
 * - No server-only imports (safe in the client bundle)
 */

import { fetchApi } from "@utils/api";
import { logger } from "@utils/logger";

// ── Internal model context (browser only) ────────────────────────
function getModelContext(): Record<string, unknown> | undefined {
  if (typeof window === "undefined") return undefined;
  return (window.document as unknown as { modelContext?: Record<string, unknown> })?.modelContext;
}

function formatError(tag: string, err: unknown) {
  logger.error(tag, { error: err });
  return {
    isError: true,
    content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
  };
}

/**
 * Register the `design_collection` builder tool with the browser modelContext.
 * No-op outside the browser (headless registration is `registerBuilderServerTools`).
 */
export function registerBuilderTools(): void {
  const modelContext = getModelContext();
  if (!modelContext) return;

  const registerTool = (
    modelContext as unknown as {
      registerTool: (def: {
        name: string;
        description: string;
        parameters: Record<string, unknown>;
        execute: (params: unknown) => Promise<unknown>;
      }) => void;
    }
  ).registerTool;

  registerTool({
    name: "design_collection",
    description: "Generate a validated collection schema proposal from natural language intent.",
    parameters: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "Description of the collection to create" },
        name: { type: "string", description: "Optional collection name (e.g. recipes)" },
        description: { type: "string", description: "Optional collection purpose" },
        language: { type: "string", description: "Optional language code (e.g. en, de)" },
      },
      required: ["prompt"],
    },
    execute: async (params: unknown) => {
      try {
        const res = await fetchApi<{ proposal?: unknown }>("/api/ai-builder/design-collection", {
          method: "POST",
          body: JSON.stringify(params),
        });
        if (!res.success) throw new Error(res.error || "Failed to design collection");
        return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
      } catch (err: unknown) {
        return formatError("[WebMCP] design_collection failed", err);
      }
    },
  });
}
