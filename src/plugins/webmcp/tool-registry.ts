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
 * - capability classification (`read` / `write`) for HTTP scope enforcement
 * - `invoke` adapters that map named MCP arguments onto positional handlers
 * - backward-compatible `__webmcp_headless_tools` bag (handlers only) plus a
 *   new `__webmcp_tool_catalog` (metadata) for headless integrations
 */

import type { ApiKey } from "@databases/auth/types";
import type { DatabaseId } from "@content/types";
import { logger } from "@utils/logger";

/** Least capability a token needs before it may call a tool. */
export type ToolCapability = "read" | "write";

/** Execution context supplied by the authenticated HTTP transport. */
export interface ToolExecutionContext {
  /** Tenant from the authenticated token (`null` in single-tenant mode). */
  tenantId: DatabaseId | null;
  /** The authenticated API key row (owner, scopes, permissions). */
  apiKey: ApiKey;
}

/**
 * Raised when an MCP argument is missing or has the wrong shape. The transport
 * maps it onto JSON-RPC `-32602` (invalid params) instead of `-32603`.
 */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}

/** A short string description or an inline JSON Schema fragment. */
export type ToolParameterSpec = string | Record<string, unknown>;

/** Metadata contract for a headless (server-side) AI tool. */
export interface ServerToolDef<P extends unknown[] = unknown[]> {
  /** Unique tool name, e.g. `get_collections`. */
  name: string;
  /** Human/AI-readable description of what the tool does. */
  description: string;
  /** Parameter names → short descriptions or JSON Schema fragments. */
  parameters?: Record<string, ToolParameterSpec>;
  /** Argument keys that must be present (advertised + enforced by transport). */
  required?: string[];
  /** Full JSON Schema override for `tools/list` (derived from `parameters` otherwise). */
  inputSchema?: Record<string, unknown>;
  /**
   * Least capability required to call the tool. Omitting it means `write`
   * (fail closed) — only tools explicitly classified as `read` are reachable
   * with a `webmcp:read` token.
   */
  capability?: ToolCapability;
  /**
   * Map a named-argument object from `tools/call` onto the handler's positional
   * signature and inject the execution context. Omitting it calls
   * `handler(args)` — correct for tools that take a single object argument.
   */
  invoke?: (args: Record<string, unknown>, context: ToolExecutionContext) => unknown;
  /** The callable implementation — signature inferred per tool at registration. */
  handler: (...args: P) => unknown;
}

/** Resolve the effective capability (unclassified tools fail closed as `write`). */
export function resolveToolCapability(tool: ServerToolDef): ToolCapability {
  return tool.capability === "read" ? "read" : "write";
}

/** Invoke a tool with named arguments and the authenticated execution context. */
export function callServerTool(
  tool: ServerToolDef,
  args: Record<string, unknown>,
  context: ToolExecutionContext,
): unknown {
  if (tool.invoke) return tool.invoke(args, context);
  return tool.handler(args);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Required non-empty string argument (`ToolInputError` otherwise). */
export function readRequiredStringArgument(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ToolInputError(`"${key}" must be a non-empty string`);
  }
  return value;
}

/** Optional string argument; `undefined` when absent, `ToolInputError` on a wrong type. */
export function readOptionalStringArgument(
  args: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new ToolInputError(`"${key}" must be a string`);
  return value;
}

/** Optional finite-number argument. */
export function readOptionalNumberArgument(
  args: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ToolInputError(`"${key}" must be a finite number`);
  }
  return value;
}

/** Optional boolean argument. */
export function readOptionalBooleanArgument(
  args: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") throw new ToolInputError(`"${key}" must be a boolean`);
  return value;
}

/** Required object argument (`ToolInputError` otherwise). */
export function readRequiredObjectArgument(
  args: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const value = args[key];
  if (!isPlainObject(value)) throw new ToolInputError(`"${key}" must be an object`);
  return value;
}

/** Optional string-array argument. */
export function readOptionalStringArrayArgument(
  args: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = args[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new ToolInputError(`"${key}" must be an array of strings`);
  }
  return value as string[];
}

/** Required array of string/number keys (virtual-collection stitch keys). */
export function readRequiredKeyArrayArgument(
  args: Record<string, unknown>,
  key: string,
): (string | number)[] {
  const value = args[key];
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" && typeof item !== "number")
  ) {
    throw new ToolInputError(`"${key}" must be a non-empty array of strings or numbers`);
  }
  return value as (string | number)[];
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
