/**
 * @file src/plugins/webmcp/tool-registry.ts
 * @description Searchable server-side tool registry for the WebMCP headless gateway.
 *
 * NOTE: deliberately NOT suffixed `.server.ts` — the module is imported from the
 * dual-environment `tools/*` modules (browser fallback + server adapter paths),
 * and SvelteKit rejects `.server.ts` imports from client code at build time.
 * The module itself is browser-safe (in-memory map + `@utils/logger` only); all
 * callers gate actual registration behind server-only branches.
 *
 * Replaces the ad-hoc `__webmcp_headless_tools` object bag (registration-order
 * only, no metadata, no lookup) with a name-keyed registry that also carries
 * tool descriptions and parameter schemas. AI gateways can now discover tools
 * search-first via `searchServerTools()` instead of scanning registration
 * order, and the metadata catalog is exported alongside the handlers for any
 * future MCP SDK wiring.
 *
 * ### Features:
 * - name-keyed registration with dedupe (HMR / double-init safe)
 * - `listServerTools()` / `searchServerTools(query)` search-first lookup
 * - `exportServerTools()` → handlers map + metadata catalog in one snapshot
 * - backward-compatible `__webmcp_headless_tools` bag (handlers only) plus a
 *   new `__webmcp_tool_catalog` (metadata) for headless integrations
 */

import { logger } from "@utils/logger";

/** Metadata contract for a headless (server-side) AI tool. */
export interface ServerToolDef<P extends unknown[] = unknown[]> {
  /** Unique tool name, e.g. `get_collections`. */
  name: string;
  /** Human/AI-readable description of what the tool does. */
  description: string;
  /** Parameter names → short descriptions (for schema discovery). */
  parameters?: Record<string, string>;
  /** The callable implementation — signature inferred per tool at registration. */
  handler: (...args: P) => unknown;
}

/** Dynamic invocation signature used by gateways (args arrive unvalidated). */
type ToolHandler = (...args: unknown[]) => unknown;

const tools = new Map<string, ServerToolDef>();

/** Register (or replace) a server tool. Re-registration is idempotent. */
export function registerServerTool<P extends unknown[]>(tool: ServerToolDef<P>): void {
  const existing = tools.get(tool.name);
  if (existing && existing.handler !== tool.handler) {
    logger.debug(`[WebMCP] Replacing server tool '${tool.name}' (re-registration)`);
  }
  tools.set(tool.name, tool as ServerToolDef);
}

/** All registered tools, in registration order. */
export function listServerTools(): ServerToolDef[] {
  return [...tools.values()];
}

/** Exact-name lookup. */
export function getServerTool(name: string): ServerToolDef | undefined {
  return tools.get(name);
}

/**
 * Search-first tool discovery. Scores by name (exact > prefix > substring),
 * then description, then parameter names. Returns the best matches.
 */
export function searchServerTools(query: string, limit = 10): ServerToolDef[] {
  const q = query.trim().toLowerCase();
  if (!q) return listServerTools().slice(0, limit);

  const scored: Array<{ tool: ServerToolDef; score: number }> = [];
  for (const tool of tools.values()) {
    const name = tool.name.toLowerCase();
    const description = tool.description.toLowerCase();
    let score = 0;
    if (name === q) score += 100;
    else if (name.startsWith(q)) score += 60;
    else if (name.includes(q)) score += 40;
    if (description.includes(q)) score += 15;
    for (const key of Object.keys(tool.parameters ?? {})) {
      if (key.toLowerCase().includes(q)) score += 5;
    }
    if (score > 0) scored.push({ tool, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((entry) => entry.tool);
}

/** Snapshot of handlers + metadata for headless gateway integration. */
export function exportServerTools(): {
  handlers: Record<string, ToolHandler>;
  catalog: ServerToolDef[];
} {
  const handlers: Record<string, ToolHandler> = {};
  for (const [name, def] of tools) handlers[name] = def.handler as ToolHandler;
  return { handlers, catalog: [...tools.values()] };
}

/**
 * Publish the registry to the headless gateway globals.
 * - `__webmcp_headless_tools`: handlers keyed by name (legacy shape, kept for
 *   existing consumers)
 * - `__webmcp_tool_catalog`: metadata (name/description/parameters) so agents
 *   can discover tools search-first before invoking them
 */
export function syncHeadlessToolBag(): void {
  const { handlers, catalog } = exportServerTools();
  (globalThis as Record<string, unknown>).__webmcp_headless_tools = handlers;
  (globalThis as Record<string, unknown>).__webmcp_tool_catalog = catalog;
}
