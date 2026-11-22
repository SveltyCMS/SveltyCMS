/**
 * @file src/plugins/webmcp/mcp-routes.server.ts
 * @description Stateless MCP JSON-RPC endpoint for the WebMCP gateway.
 *
 * `POST /api/webmcp/mcp` speaks the Model Context Protocol over plain HTTP
 * (single JSON-RPC request per HTTP request — no batching, no SSE, no session).
 * The bearer token is a WebMCP OAuth-issued SveltyCMS API key (`sck_…`); after
 * the license gate the handler authenticates it itself, enforces the token's
 * `webmcp:read` / `webmcp:write` scope per tool, and executes the tool with the
 * tenant recorded on the token.
 *
 * Features:
 * - `initialize` → protocol version + `tools` capability
 * - `ping` → `{}`
 * - `tools/list` → registered tools with derived JSON Schema `inputSchema`
 * - `tools/call` → `{ content: [{ type: "text", text: <JSON> }], isError }`
 * - Scope enforcement: `webmcp:read` calls read tools only, `webmcp:write` calls
 *   both; list is scope-agnostic so read tokens can still discover all tools
 * - `notifications/initialized` (and other id-less notifications) answer `202`
 *   with no body, as JSON-RPC 2.0 requires
 *
 * ### Security:
 * - License gate runs before any token work (403 when inactive).
 * - Missing, malformed, revoked, or expired tokens answer 401 with JSON-RPC
 *   `-32001`; a token without a `webmcp:*` scope is rejected the same way, so a
 *   general-purpose API key cannot drive this gateway.
 * - The execution tenant always comes from the token row. Argument keys that
 *   try to carry authorization context (`tenantId`, `tenant_id`, `user`,
 *   `roles`) are **stripped** before the tool runs — silently, so the response
 *   is not an oracle for which keys a tool accepts. Tools never receive the
 *   raw arguments object.
 * - Tool failures are logged server-side and surfaced as `-32603` without
 *   leaking internals; JSON-RPC envelope/scope/param errors answer HTTP 200 so
 *   MCP clients see the protocol error rather than a transport failure.
 */

import type { RequestEvent } from "@sveltejs/kit";
import { withSystemScope, type ApiKey, type IDBAdapter } from "@databases/db-interface";
import { hashApiKey, isValidApiKeyFormat } from "@src/databases/auth/api-keys";
import { checkExtensionLicense } from "@src/utils/license-manager";
import { logger } from "@utils/logger";
import { webmcpPlugin } from "./index";
import { WEBMCP_PLUGIN_ID } from "./oauth-clients.server";
import {
  ToolInputError,
  callServerTool,
  getServerTool,
  listServerTools,
  resolveToolCapability,
  type ServerToolDef,
  type ToolCapability,
  type ToolExecutionContext,
} from "./tool-registry";

/** MCP protocol revision this endpoint implements. */
export const MCP_PROTOCOL_VERSION = "2025-06-18";

/** `serverInfo.name` reported by `initialize`. */
export const MCP_SERVER_NAME = "sveltycms-webmcp";

/** Bearer scheme prefix (case-insensitive, 7 characters). */
const BEARER_SCHEME = "bearer ";

/** Defensive bound for the presented token before hashing. */
const MAX_BEARER_TOKEN_LENGTH = 512;

/** Argument keys reserved for the authenticated transport. */
const RESERVED_ARGUMENT_KEYS = new Set(["tenantId", "tenant_id", "user", "roles"]);

// JSON-RPC 2.0 error codes plus the MCP implementation-defined range.
const JSON_RPC_INVALID_REQUEST = -32600;
const JSON_RPC_METHOD_NOT_FOUND = -32601;
const JSON_RPC_INVALID_PARAMS = -32602;
const JSON_RPC_INTERNAL_ERROR = -32603;
/** Implementation-defined server error: license gate failed. */
const JSON_RPC_LICENSE_REQUIRED = -32000;
/** Implementation-defined server error: bearer token missing/invalid/expired. */
const JSON_RPC_UNAUTHORIZED = -32001;
/** Implementation-defined server error: token scope does not permit the tool. */
const JSON_RPC_SCOPE_DENIED = -32003;

const NO_STORE_HEADERS = {
  "cache-control": "no-store",
  pragma: "no-cache",
} as const;

const JSON_HEADERS = {
  ...NO_STORE_HEADERS,
  "content-type": "application/json; charset=utf-8",
} as const;

type JsonRpcId = string | number;

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result: unknown;
}

interface JsonRpcFailure {
  jsonrpc: "2.0";
  id: JsonRpcId | null;
  error: {
    code: number;
    message: string;
  };
}

interface AuthenticatedWebMcpToken {
  apiKey: ApiKey;
  scopes: string[];
}

/** JSON response carrying the mandatory no-store headers. */
function jsonResponse(body: JsonRpcSuccess | JsonRpcFailure, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function jsonRpcResult(id: JsonRpcId, result: unknown): Response {
  return jsonResponse({ jsonrpc: "2.0", id, result }, 200);
}

function jsonRpcError(
  id: JsonRpcId | null,
  code: number,
  message: string,
  status = 200,
  extraHeaders?: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonRpcId(value: unknown): value is string | number {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value));
}

/** Request-scoped adapter, falling back to the process adapter in direct calls. */
async function resolveDb(event: RequestEvent): Promise<IDBAdapter | null> {
  const local = event.locals.dbAdapter;
  if (local) return local;
  const { getDb } = await import("@src/databases/db");
  return getDb();
}

/** Extract the bearer value from `Authorization: Bearer …` (null when absent/malformed). */
export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const value = header.trim();
  if (value.length <= BEARER_SCHEME.length) return null;
  if (value.slice(0, BEARER_SCHEME.length).toLowerCase() !== BEARER_SCHEME) return null;

  const token = value.slice(BEARER_SCHEME.length).trim();
  if (token.length === 0 || token.length > MAX_BEARER_TOKEN_LENGTH) return null;
  return token;
}

/**
 * A WebMCP token must be unexpired **and** carry a WebMCP scope.
 *
 * `expiresAt` is mandatory: tokens minted by the OAuth endpoint always set it,
 * and an API key without one must not become a long-lived gateway credential
 * by omission.
 */
function tokenIsUsable(apiKey: ApiKey): boolean {
  if (apiKey.revoked === true) return false;
  if (!apiKey.expiresAt) return false;
  // Relational adapters normalize to ISO strings; the Mongo adapter stores a
  // `Date` and its lean() read does not convert, so accept both shapes.
  const rawExpiry: unknown = apiKey.expiresAt;
  const expiresAtMs =
    rawExpiry instanceof Date
      ? rawExpiry.getTime()
      : typeof rawExpiry === "string"
        ? Date.parse(rawExpiry)
        : Number.NaN;
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) return false;
  return Array.isArray(apiKey.scopes) && apiKey.scopes.length > 0;
}

/**
 * Validate the bearer token against the adapter.
 *
 * The lookup is intentionally tenant-agnostic: the token hash is globally
 * unique and the tenant is only known *after* the row loads. `withSystemScope`
 * is the documented plugin path for that pre-tenant read under MULTI_TENANT —
 * omitting it would make Mongo's `safeQuery` fail closed. Everything after this
 * point must use `apiKey.tenantId`, never a request-supplied tenant.
 */
async function authenticateToken(
  db: IDBAdapter,
  request: Request,
): Promise<AuthenticatedWebMcpToken | null> {
  const token = readBearerToken(request);
  if (!token || !isValidApiKeyFormat(token)) return null;

  const hash = hashApiKey(token);
  const result = await db.auth.getApiKey(hash, withSystemScope("plugin"));
  const apiKey = result.success ? result.data : null;
  if (!apiKey || !tokenIsUsable(apiKey)) return null;

  const scopes: string[] = [];
  for (const scope of apiKey.scopes) {
    if (typeof scope === "string" && !scopes.includes(scope)) scopes.push(scope);
  }
  if (!scopes.includes("webmcp:read") && !scopes.includes("webmcp:write")) return null;

  return { apiKey, scopes };
}

/** `webmcp:write` implies read; `webmcp:read` only unlocks read tools. */
function tokenCanUseCapability(scopes: readonly string[], capability: ToolCapability): boolean {
  if (scopes.includes("webmcp:write")) return true;
  return capability === "read" && scopes.includes("webmcp:read");
}

/**
 * Make sure the headless tools are registered.
 *
 * `initWebMCPServer` is not wired into a boot hook, so the first authenticated
 * MCP request performs the (idempotent) registration itself. A failed attempt
 * leaves the registry empty and is retried by the next request.
 */
async function ensureToolsRegistered(db: IDBAdapter): Promise<void> {
  if (listServerTools().length > 0) return;
  // Dynamic import keeps the AI builder services out of the plugin-route boot
  // graph until an authenticated MCP request actually needs them.
  const { initWebMCPServer } = await import("./init.server");
  await initWebMCPServer(db);
  if (listServerTools().length === 0) {
    logger.warn("[WebMCP] Tool registry is still empty after initialization");
  }
}

/** Derive the JSON Schema advertised by `tools/list`. */
export function buildToolInputSchema(tool: ServerToolDef): Record<string, unknown> {
  if (tool.inputSchema) return tool.inputSchema;

  const properties: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(tool.parameters ?? {})) {
    properties[key] = typeof spec === "string" ? { type: "string", description: spec } : spec;
  }

  const required = tool.required ?? [];
  return {
    type: "object",
    properties,
    ...(required.length > 0 ? { required: [...required] } : {}),
  };
}

/** Shape a registry tool for `tools/list`. */
export function toMcpTool(tool: ServerToolDef): Record<string, unknown> {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: buildToolInputSchema(tool),
    annotations: { readOnlyHint: resolveToolCapability(tool) === "read" },
  };
}

/** First required key that is absent (`undefined`); JSON `null` is a valid value. */
function findMissingRequiredArgument(
  tool: ServerToolDef,
  args: Record<string, unknown>,
): string | null {
  for (const key of tool.required ?? []) {
    if (args[key] === undefined) return key;
  }
  return null;
}

/**
 * Remove authorization-context keys from tool arguments.
 *
 * `tenantId`/`tenant_id`/`user`/`roles` are never tool input: the tenant comes
 * from the token and the caller identity from the API key row. Stripping (as
 * opposed to rejecting) keeps tool responses from becoming an oracle for which
 * reserved names a given tool exposes.
 */
function sanitizeToolArguments(args: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (RESERVED_ARGUMENT_KEYS.has(key)) {
      logger.debug(`[WebMCP] Ignoring reserved MCP argument "${key}" (context is token-bound)`);
      continue;
    }
    sanitized[key] = value;
  }
  return sanitized;
}

/** Mark tool-level error envelopes so MCP clients see `isError: true`. */
function toolResultIsError(result: unknown): boolean {
  if (!isRecord(result)) return false;
  return result.isError === true || result.success === false;
}

/** Serialize a tool result into the MCP text content block. */
function serializeToolResult(result: unknown): { text: string; serializationFailed: boolean } {
  try {
    return { text: JSON.stringify(result) ?? "null", serializationFailed: false };
  } catch (err) {
    logger.error("[WebMCP] Tool result is not JSON-serializable", { error: err });
    return {
      text: JSON.stringify({ error: "Tool result is not JSON-serializable" }),
      serializationFailed: true,
    };
  }
}

/** `tools/call` — authenticate, authorize, validate, execute. */
async function handleToolCall(
  id: JsonRpcId,
  rawParams: unknown,
  token: AuthenticatedWebMcpToken,
  context: ToolExecutionContext,
): Promise<Response> {
  if (!isRecord(rawParams)) {
    return jsonRpcError(
      id,
      JSON_RPC_INVALID_PARAMS,
      "tools/call requires params { name, arguments }",
    );
  }

  const name = rawParams.name;
  if (typeof name !== "string" || name.trim().length === 0) {
    return jsonRpcError(id, JSON_RPC_INVALID_PARAMS, 'tools/call requires a non-empty "name"');
  }

  const rawArguments = rawParams.arguments;
  if (rawArguments !== undefined && !isRecord(rawArguments)) {
    return jsonRpcError(id, JSON_RPC_INVALID_PARAMS, '"arguments" must be an object');
  }

  const tool = getServerTool(name);
  if (!tool) {
    return jsonRpcError(id, JSON_RPC_METHOD_NOT_FOUND, `Unknown tool: ${name}`);
  }

  const capability = resolveToolCapability(tool);
  if (!tokenCanUseCapability(token.scopes, capability)) {
    return jsonRpcError(
      id,
      JSON_RPC_SCOPE_DENIED,
      `Token scope does not permit ${capability} tools; "${name}" requires webmcp:${capability}`,
    );
  }

  const args = sanitizeToolArguments(rawArguments ?? {});
  const missing = findMissingRequiredArgument(tool, args);
  if (missing) {
    return jsonRpcError(id, JSON_RPC_INVALID_PARAMS, `Missing required argument: "${missing}"`);
  }

  try {
    const result = await callServerTool(tool, args, context);
    const serialized = serializeToolResult(result);
    return jsonRpcResult(id, {
      content: [{ type: "text", text: serialized.text }],
      isError: serialized.serializationFailed || toolResultIsError(result),
    });
  } catch (err) {
    if (err instanceof ToolInputError) {
      return jsonRpcError(id, JSON_RPC_INVALID_PARAMS, err.message);
    }
    logger.error(`[WebMCP] Tool "${name}" failed`, { error: err });
    return jsonRpcError(id, JSON_RPC_INTERNAL_ERROR, "Internal error while executing the tool");
  }
}

/** Id-less payloads are JSON-RPC notifications and must not receive a response. */
function notificationAccepted(): Response {
  return new Response(null, { status: 202, headers: NO_STORE_HEADERS });
}

/**
 * `POST /api/webmcp/mcp`
 *
 * Registered as a `requiredCapabilities: "public"` plugin route: the handler
 * performs the bearer authentication the dispatcher would otherwise do, and
 * scopes execution to the tenant recorded on the token.
 */
export async function handleWebMcpMcpRequest(event: RequestEvent): Promise<Response> {
  const license = await checkExtensionLicense("plugin", WEBMCP_PLUGIN_ID);
  if (!license.active) {
    return jsonRpcError(
      null,
      JSON_RPC_LICENSE_REQUIRED,
      "An active WebMCP license is required for the MCP endpoint",
      403,
    );
  }

  const db = await resolveDb(event);
  if (!db) {
    return jsonRpcError(null, JSON_RPC_INTERNAL_ERROR, "Database unavailable", 503);
  }

  let token: AuthenticatedWebMcpToken | null;
  try {
    token = await authenticateToken(db, event.request);
  } catch (err) {
    logger.error("[WebMCP] Token authentication failed", { error: err });
    return jsonRpcError(null, JSON_RPC_INTERNAL_ERROR, "Authentication unavailable", 503);
  }
  if (!token) {
    return jsonRpcError(
      null,
      JSON_RPC_UNAUTHORIZED,
      "Unauthorized: a valid, unexpired WebMCP bearer token is required",
      401,
      { "www-authenticate": 'Bearer error="invalid_token"' },
    );
  }

  await ensureToolsRegistered(db);

  let payload: unknown;
  try {
    payload = await event.request.json();
  } catch (err) {
    logger.debug(
      `[WebMCP] Malformed MCP request body: ${err instanceof Error ? err.message : String(err)}`,
    );
    return jsonRpcError(null, JSON_RPC_INVALID_REQUEST, "Parse error: body must be valid JSON");
  }

  if (Array.isArray(payload)) {
    return jsonRpcError(null, JSON_RPC_INVALID_REQUEST, "Batch requests are not supported");
  }
  if (!isRecord(payload) || payload.jsonrpc !== "2.0" || typeof payload.method !== "string") {
    return jsonRpcError(null, JSON_RPC_INVALID_REQUEST, "Invalid JSON-RPC 2.0 request");
  }

  const method = payload.method;
  if (payload.id === undefined) {
    // Notifications (including the MCP `notifications/initialized` handshake)
    // never receive a JSON-RPC response.
    return notificationAccepted();
  }
  if (!isJsonRpcId(payload.id)) {
    return jsonRpcError(null, JSON_RPC_INVALID_REQUEST, "Invalid JSON-RPC id");
  }
  const id = payload.id;

  switch (method) {
    case "initialize":
      return jsonRpcResult(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        serverInfo: { name: MCP_SERVER_NAME, version: webmcpPlugin.metadata.version },
        capabilities: { tools: {} },
      });
    case "ping":
      return jsonRpcResult(id, {});
    case "tools/list":
      return jsonRpcResult(id, { tools: listServerTools().map((tool) => toMcpTool(tool)) });
    case "tools/call":
      return handleToolCall(id, payload.params, token, {
        tenantId: token.apiKey.tenantId ?? null,
        apiKey: token.apiKey,
      });
    default:
      if (method.startsWith("notifications/")) return notificationAccepted();
      return jsonRpcError(id, JSON_RPC_METHOD_NOT_FOUND, `Method not found: ${method}`);
  }
}
