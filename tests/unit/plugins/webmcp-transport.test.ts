/**
 * @file tests/unit/plugins/webmcp-transport.test.ts
 * @description MCP JSON-RPC transport for the WebMCP gateway.
 *
 * Features:
 * - license gate, bearer authentication (missing/expired/revoked/no scope)
 * - `initialize` / `ping` / `tools/list` / `tools/call` envelopes
 * - per-tool scope enforcement and JSON-RPC error codes
 * - token-bound tenant, reserved-argument stripping, tenant propagation
 * - public route registration
 *
 * The license manager is mocked and the adapter is an in-memory double — no
 * database and no network.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import type { ApiKey, DatabaseId, IDBAdapter, ISODateString } from "@databases/db-interface";
import { generateApiKey } from "@src/databases/auth/api-keys";
import { toISOString } from "@utils/date";
import { parts } from "@plugins/webmcp/index.server";
import { handleWebMcpMcpRequest } from "@plugins/webmcp/mcp-routes.server";
import { registerContentTools } from "@plugins/webmcp/tools/content";
import { registerServerTool, type ToolExecutionContext } from "@plugins/webmcp/tool-registry";

const licenseMock = vi.fn();
vi.mock("@src/utils/license-manager", () => ({
  checkExtensionLicense: (...args: unknown[]) => licenseMock(...args),
}));

const TENANT = "tenant-a";
const OTHER_TENANT = "tenant-b";
const JWT_SECRET = "unit-test-webmcp-transport-secret-0123456789abcdef";
const ISO_NOW = "2026-11-22T00:00:00.000Z" as ISODateString;
const FUTURE_EXPIRY = toISOString(Date.now() + 60 * 60 * 1000);
const EXPIRED = "2020-01-01T00:00:00.000Z" as ISODateString;

interface RecordedCall {
  args: Record<string, unknown>;
  context: ToolExecutionContext;
}

let recorded: RecordedCall | null = null;

registerServerTool({
  name: "test_read",
  description: "Read-only transport test tool",
  capability: "read",
  parameters: { value: "A value" },
  required: ["value"],
  invoke: (args, context) => {
    recorded = { args, context };
    return { success: true, value: args.value };
  },
  handler: () => ({ success: true }),
});

registerServerTool({
  name: "test_write",
  description: "Write transport test tool",
  capability: "write",
  invoke: (_args, context) => {
    recorded = { args: {}, context };
    return { success: true, written: true };
  },
  handler: () => ({ success: true }),
});

registerServerTool({
  name: "test_default",
  description: "Unclassified transport test tool (must fail closed as write)",
  invoke: () => ({ success: true }),
  handler: () => ({ success: true }),
});

interface MockState {
  apiKeys: Map<string, ApiKey>;
  findManyCalls: Array<{ collection: string; options: unknown }>;
  insertCalls: Array<{ collection: string; data: unknown; options: unknown }>;
}

function makeState(): MockState {
  return { apiKeys: new Map(), findManyCalls: [], insertCalls: [] };
}

function buildDb(state: MockState): IDBAdapter {
  const db = {
    collection: {
      listSchemas: vi.fn(async () => ({
        success: true,
        data: [{ _id: "posts_col", name: "posts", fields: [] }],
      })),
      getSchema: vi.fn(async (collectionId: string) => ({
        success: true,
        data: { _id: collectionId, name: collectionId, fields: [] },
      })),
    },
    crud: {
      findMany: vi.fn(async (collection: string, _filter: unknown, options: unknown) => {
        state.findManyCalls.push({ collection, options });
        return { success: true, data: [] };
      }),
      insert: vi.fn(async (collection: string, data: unknown, options: unknown) => {
        state.insertCalls.push({ collection, data, options });
        return { success: true, data: { ...(data as Record<string, unknown>), _id: "entry-1" } };
      }),
    },
    auth: {
      getApiKey: vi.fn(async (hash: string) => ({
        success: true,
        data: state.apiKeys.get(hash) ?? null,
      })),
    },
  };
  return db as unknown as IDBAdapter;
}

interface JsonRpcReply {
  jsonrpc: string;
  id: string | number | null;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

interface RpcOptions {
  /** `undefined` → use the default read token; `null` → send no Authorization header. */
  token?: string | null;
  body?: unknown;
  rawBody?: string;
}

let state: MockState;
let db: IDBAdapter;
let readToken: string;
let writeToken: string;

function issueToken(scopes: ApiKey["scopes"], overrides: Partial<ApiKey> = {}): string {
  const { full, prefix, hash } = generateApiKey();
  const row: ApiKey = {
    _id: `api-key-${state.apiKeys.size + 1}` as DatabaseId,
    name: "WebMCP transport test token",
    hash,
    prefix,
    userId: "wmc_transport_test_owner_00000000000" as DatabaseId,
    permissions: [],
    scopes,
    revoked: false,
    tenantId: TENANT as DatabaseId,
    usageCount: 0,
    createdAt: ISO_NOW,
    expiresAt: FUTURE_EXPIRY,
    ...overrides,
  };
  state.apiKeys.set(hash, row);
  return full;
}

function makeEvent(options: RpcOptions): RequestEvent {
  const headers: Record<string, string> = { "content-type": "application/json" };
  const token = options.token === undefined ? readToken : options.token;
  if (token) headers.authorization = `Bearer ${token}`;

  const body = options.rawBody ?? JSON.stringify(options.body ?? {});

  return {
    request: new Request("http://localhost/api/webmcp/mcp", {
      method: "POST",
      headers,
      body,
    }),
    locals: { dbAdapter: db, tenantId: null },
  } as unknown as RequestEvent;
}

async function rpc(options: RpcOptions = {}): Promise<{
  status: number;
  headers: Headers;
  body: JsonRpcReply;
}> {
  const response = await handleWebMcpMcpRequest(makeEvent(options));
  return {
    status: response.status,
    headers: response.headers,
    body: (await response.json()) as JsonRpcReply,
  };
}

function request(id: string | number, method: string, params?: unknown): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id,
    method,
    ...(params === undefined ? {} : { params }),
  };
}

function callTool(
  id: string | number,
  name: string,
  args?: Record<string, unknown>,
): Record<string, unknown> {
  return request(id, "tools/call", args === undefined ? { name } : { name, arguments: args });
}

function toolResult(reply: JsonRpcReply): {
  content: Array<{ type: string; text: string }>;
  isError: boolean;
} {
  return reply.result as unknown as {
    content: Array<{ type: string; text: string }>;
    isError: boolean;
  };
}

describe("WebMCP MCP transport", () => {
  beforeEach(() => {
    (globalThis as { privateEnv?: unknown }).privateEnv = { JWT_SECRET_KEY: JWT_SECRET };
    licenseMock.mockReset();
    licenseMock.mockResolvedValue({ active: true, daysRemaining: 30, hasLicense: true });
    state = makeState();
    db = buildDb(state);
    registerContentTools(db);
    recorded = null;
    readToken = issueToken(["webmcp:read"]);
    writeToken = issueToken(["webmcp:write"]);
  });

  it("registers POST /api/webmcp/mcp as a public plugin route", () => {
    const routePart = parts.find((part) => part.type === "route");
    if (!routePart || routePart.type !== "route") throw new Error("route part is missing");

    const route = routePart.routes.find((candidate) => candidate.path === "/api/webmcp/mcp");
    expect(route).toBeDefined();
    expect(route?.method).toBe("POST");
    expect(route?.requiredCapabilities).toBe("public");
  });

  it("answers initialize with the MCP protocol version and tools capability", async () => {
    const reply = await rpc({
      body: request(1, "initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "transport-test", version: "1.0.0" },
      }),
    });

    expect(reply.status).toBe(200);
    expect(reply.body.id).toBe(1);
    expect(reply.body.result?.protocolVersion).toBe("2025-06-18");
    expect(reply.body.result?.capabilities).toEqual({ tools: {} });
    expect(reply.body.result?.serverInfo).toMatchObject({ name: "sveltycms-webmcp" });
  });

  it("answers ping with an empty result", async () => {
    const reply = await rpc({ body: request(2, "ping") });
    expect(reply.status).toBe(200);
    expect(reply.body.result).toEqual({});
  });

  it("lists registered tools with inputSchema and capability annotations", async () => {
    const reply = await rpc({ body: request(3, "tools/list") });
    const tools = reply.body.result?.tools as Array<Record<string, unknown>>;

    const readTool = tools.find((tool) => tool.name === "test_read");
    expect(readTool?.inputSchema).toEqual({
      type: "object",
      properties: { value: { type: "string", description: "A value" } },
      required: ["value"],
    });
    expect(readTool?.annotations).toEqual({ readOnlyHint: true });

    const writeTool = tools.find((tool) => tool.name === "test_write");
    expect(writeTool?.annotations).toEqual({ readOnlyHint: false });

    // Content tools registered for this test are discoverable too.
    expect(tools.some((tool) => tool.name === "list_entries")).toBe(true);
  });

  it("calls a read tool with a read token", async () => {
    const reply = await rpc({ body: callTool(4, "test_read", { value: "hello" }) });
    const result = toolResult(reply.body);

    expect(reply.body.error).toBeUndefined();
    expect(result.isError).toBe(false);
    expect(result.content[0]?.type).toBe("text");
    expect(JSON.parse(result.content[0]?.text ?? "null")).toEqual({
      success: true,
      value: "hello",
    });
  });

  it("rejects a write tool for a read token with -32003", async () => {
    const reply = await rpc({ body: callTool(5, "test_write") });

    expect(reply.body.error?.code).toBe(-32003);
    expect(reply.body.error?.message).toMatch(/webmcp:write/);
    expect(recorded).toBeNull();
  });

  it("treats an unclassified tool as write (fail closed)", async () => {
    const reply = await rpc({ body: callTool(6, "test_default") });

    expect(reply.body.error?.code).toBe(-32003);
    expect(recorded).toBeNull();
  });

  it("allows a write token to call read and write tools", async () => {
    const readReply = await rpc({
      token: writeToken,
      body: callTool(7, "test_read", { value: "both" }),
    });
    expect(readReply.body.error).toBeUndefined();

    const writeReply = await rpc({ token: writeToken, body: callTool(8, "test_write") });
    expect(writeReply.body.error).toBeUndefined();
    expect(JSON.parse(toolResult(writeReply.body).content[0]?.text ?? "null")).toEqual({
      success: true,
      written: true,
    });
  });

  it("returns -32601 for an unknown tool", async () => {
    const reply = await rpc({ body: callTool(9, "not_a_tool") });
    expect(reply.body.error?.code).toBe(-32601);
    expect(reply.body.error?.message).toMatch(/Unknown tool/);
  });

  it("returns -32600 for a malformed JSON-RPC request", async () => {
    const reply = await rpc({
      body: { jsonrpc: "1.0", id: 10, method: "ping" },
    });

    expect(reply.status).toBe(200);
    expect(reply.body.error?.code).toBe(-32600);
  });

  it("returns -32600 for unparseable JSON", async () => {
    const reply = await rpc({ rawBody: "{ not json" });
    expect(reply.status).toBe(200);
    expect(reply.body.error?.code).toBe(-32600);
  });

  it("rejects batch requests", async () => {
    const reply = await rpc({ body: [request(11, "ping")] });
    expect(reply.body.error?.code).toBe(-32600);
    expect(reply.body.error?.message).toMatch(/Batch/);
  });

  it("answers 202 without a body for the notifications/initialized handshake", async () => {
    const response = await handleWebMcpMcpRequest(
      makeEvent({ body: { jsonrpc: "2.0", method: "notifications/initialized" } }),
    );

    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
  });

  it("returns -32602 for bad params and missing required arguments", async () => {
    const badArguments = await rpc({
      body: request(12, "tools/call", { name: "test_read", arguments: "nope" }),
    });
    expect(badArguments.body.error?.code).toBe(-32602);

    const missingArgument = await rpc({ body: callTool(13, "test_read", {}) });
    expect(missingArgument.body.error?.code).toBe(-32602);
    expect(missingArgument.body.error?.message).toMatch(/value/);

    const missingName = await rpc({ body: request(14, "tools/call", {}) });
    expect(missingName.body.error?.code).toBe(-32602);
  });

  it("rejects a missing bearer token with 401 / -32001", async () => {
    const reply = await rpc({ token: null, body: request(15, "ping") });

    expect(reply.status).toBe(401);
    expect(reply.body.error?.code).toBe(-32001);
    expect(reply.headers.get("www-authenticate")).toContain("invalid_token");
  });

  it("rejects an expired token with 401 / -32001", async () => {
    const expiredToken = issueToken(["webmcp:read"], { expiresAt: EXPIRED });
    const reply = await rpc({ token: expiredToken, body: request(16, "ping") });

    expect(reply.status).toBe(401);
    expect(reply.body.error?.code).toBe(-32001);
  });

  it("rejects a token without an expiry with 401 / -32001", async () => {
    const noExpiryToken = issueToken(["webmcp:read"], { expiresAt: undefined });
    const reply = await rpc({ token: noExpiryToken, body: request(17, "ping") });

    expect(reply.status).toBe(401);
    expect(reply.body.error?.code).toBe(-32001);
  });

  it("rejects a revoked token with 401 / -32001", async () => {
    const revokedToken = issueToken(["webmcp:read"], { revoked: true });
    const reply = await rpc({ token: revokedToken, body: request(18, "ping") });

    expect(reply.status).toBe(401);
    expect(reply.body.error?.code).toBe(-32001);
  });

  it("rejects a non-WebMCP API key with 401 / -32001", async () => {
    const contentToken = issueToken(["content:read"]);
    const reply = await rpc({ token: contentToken, body: request(19, "tools/list") });

    expect(reply.status).toBe(401);
    expect(reply.body.error?.code).toBe(-32001);
  });

  it("fails closed with 403 when the license is inactive", async () => {
    licenseMock.mockResolvedValue({ active: false, daysRemaining: 0, hasLicense: false });
    const reply = await rpc({ body: request(20, "ping") });

    expect(reply.status).toBe(403);
    expect(reply.body.error?.code).toBe(-32000);
  });

  it("executes under the token tenant and strips reserved arguments", async () => {
    const reply = await rpc({
      body: callTool(21, "test_read", {
        value: "scoped",
        tenantId: OTHER_TENANT,
        tenant_id: OTHER_TENANT,
        user: { isAdmin: true },
        roles: ["admin"],
      }),
    });

    expect(reply.body.error).toBeUndefined();
    expect(recorded).not.toBeNull();
    expect(recorded?.context.tenantId).toBe(TENANT);
    expect(recorded?.context.apiKey.tenantId).toBe(TENANT);
    expect(recorded?.args).toEqual({ value: "scoped" });
  });

  it("propagates the token tenant into registered content tools", async () => {
    const reply = await rpc({
      token: writeToken,
      body: callTool(22, "list_entries", { collectionId: "posts", limit: 5 }),
    });

    expect(reply.body.error).toBeUndefined();
    expect(state.findManyCalls).toHaveLength(1);
    expect(state.findManyCalls[0]?.collection).toBe("posts");
    expect(state.findManyCalls[0]?.options).toMatchObject({ limit: 5, tenantId: TENANT });
  });

  it("forces draft and blocks a payload tenant override on create_entry", async () => {
    const reply = await rpc({
      token: writeToken,
      body: callTool(23, "create_entry", {
        collectionId: "posts",
        data: { title: "Agent draft", status: "published", tenantId: OTHER_TENANT },
      }),
    });

    expect(reply.body.error).toBeUndefined();
    const insert = state.insertCalls[0];
    expect(insert?.options).toMatchObject({ tenantId: TENANT });
    expect(insert?.data).toMatchObject({ title: "Agent draft", status: "draft" });
    const insertedData = insert?.data as Record<string, unknown> | undefined;
    expect(insertedData?.tenantId).toBeUndefined();
  });

  it("returns no-store on every response", async () => {
    const reply = await rpc({ body: request(24, "ping") });
    expect(reply.headers.get("cache-control")).toBe("no-store");
    expect(reply.headers.get("content-type")).toContain("application/json");
  });
});
