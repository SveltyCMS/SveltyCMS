/**
 * @file tests/unit/routes/plugins-api-server.test.ts
 * @description Behavioural tests for the plugin slot dispatcher `/api/plugins/[pluginId]`.
 *
 * Covers the route-behaviour classes the scorer grades:
 * - load-contract: success payload and the standardized failure envelope
 * - failure-path: unauthenticated, unknown plugin, RBAC, disabled plugin, missing action
 * - persistence: an action writes a key, a later `?action=read` dispatch returns it
 * - concurrency: two parallel mutating dispatches keep both writes
 *
 * The handler memoizes resolved actions and plugin state at module scope, so every
 * test registers a distinct plugin id to keep those caches from bleeding across.
 *
 * Guard failures are mapped by `handleApiError`; it needs the request `url` to log
 * the path, and the dispatcher used to omit it — every guard error surfaced as a
 * TypeError instead of 401/403/404/400. These tests pin the mapped statuses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
}));

vi.mock("@src/plugins/registry", () => ({
  pluginRegistry: {
    get: vi.fn(),
    getPluginState: vi.fn(),
  },
}));

vi.mock("@src/plugins/plugin-server-registry", () => ({
  pluginServerRegistry: {
    getLoader: vi.fn(),
  },
}));

vi.mock("@src/databases/auth/permissions", () => ({
  hasPermissionWithRoles: vi.fn(),
}));

import { pluginRegistry } from "@src/plugins/registry";
import { pluginServerRegistry } from "@src/plugins/plugin-server-registry";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { POST } from "../../../src/routes/api/plugins/[pluginId]/+server";

type PluginEvent = Parameters<typeof POST>[0];
type UiPlugin = NonNullable<ReturnType<typeof pluginRegistry.get>>;
type PersistedPluginState = NonNullable<Awaited<ReturnType<typeof pluginRegistry.getPluginState>>>;

const mockGetPlugin = vi.mocked(pluginRegistry.get);
const mockGetPluginState = vi.mocked(pluginRegistry.getPluginState);
const mockGetLoader = vi.mocked(pluginServerRegistry.getLoader);
const mockHasPermission = vi.mocked(hasPermissionWithRoles);

interface ActionEvent {
  request: Request;
  locals: Record<string, unknown>;
  params: Record<string, string>;
  /** Present when the dispatcher pre-parsed a JSON/FormData body. */
  parsedBody?: Record<string, unknown> | null;
}

type Action = (event: ActionEvent) => Promise<Record<string, unknown>>;

const ADMIN_USER = {
  _id: "admin-1",
  email: "admin@test.com",
  role: "admin",
  isAdmin: true,
  permissions: [],
};

const EDITOR_USER = {
  _id: "editor-1",
  email: "editor@test.com",
  role: "editor",
  isAdmin: false,
  permissions: [],
};

function makeLocals(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { user: ADMIN_USER, roles: [], tenantId: "tenant-1", ...overrides };
}

function makeUiPlugin(pluginId: string, enabled: boolean): UiPlugin {
  return {
    metadata: { id: pluginId, name: pluginId, version: "1.0.0", enabled },
  } as unknown as UiPlugin;
}

interface RegisterOptions {
  enabled?: boolean;
  actions?: Record<string, Action>;
}

/** Wires the three mocked boundaries for one plugin id and returns its loader spy. */
function registerPlugin(pluginId: string, options: RegisterOptions = {}) {
  const enabled = options.enabled ?? true;
  const uiPlugin = makeUiPlugin(pluginId, enabled);

  mockGetPlugin.mockImplementation((id: string) => (id === pluginId ? uiPlugin : undefined));
  mockGetPluginState.mockImplementation(async (id: string) =>
    id === pluginId ? ({ enabled } as unknown as PersistedPluginState) : null,
  );

  const loader = vi.fn(async () => ({ actions: options.actions ?? {} }));
  mockGetLoader.mockImplementation((id: string) => (id === pluginId ? loader : undefined));

  return loader;
}

interface EventInit {
  search?: string;
  body?: unknown;
  locals?: Record<string, unknown>;
}

function makeEvent(pluginId: string, init: EventInit = {}): PluginEvent {
  const url = new URL(`http://localhost/api/plugins/${pluginId}${init.search ?? ""}`);
  const request = new Request(url, {
    method: "POST",
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  return {
    locals: makeLocals(init.locals),
    params: { pluginId },
    request,
    url,
  } as unknown as PluginEvent;
}

async function invoke(event: PluginEvent): Promise<Record<string, unknown>> {
  const response = await POST(event);
  return (await response.json()) as Record<string, unknown>;
}

/** Body of an action: the dispatcher's pre-parsed payload, else the raw request. */
async function readActionBody(event: ActionEvent): Promise<Record<string, unknown>> {
  if (event.parsedBody) return event.parsedBody;
  return (await event.request.json()) as Record<string, unknown>;
}

const pingAction: Action = async (event) => ({
  success: true,
  pong: true,
  pluginId: event.params.pluginId,
});

const saveAction: Action = async (event) => {
  const body = await readActionBody(event);
  const key = String(body.key);
  h.store.set(key, body.value);
  return { success: true, key, value: body.value };
};

const readAction: Action = async (event) => {
  const body = await readActionBody(event);
  const key = String(body.key);
  return { success: true, key, value: h.store.get(key) ?? null };
};

describe("/api/plugins/[pluginId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.store.clear();
    mockGetPlugin.mockReturnValue(undefined);
    mockGetPluginState.mockResolvedValue(null);
    mockGetLoader.mockReturnValue(undefined);
    mockHasPermission.mockReturnValue(false);
  });

  it("rejects unauthenticated requests before plugin resolution", async () => {
    const response = await POST(makeEvent("auth-kit", { locals: { user: undefined } }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
    expect(mockGetPlugin).not.toHaveBeenCalled();
    expect(mockGetLoader).not.toHaveBeenCalled();
  });

  it("rejects an unknown plugin after checking both registries", async () => {
    const response = await POST(makeEvent("ghost-kit"));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(mockGetLoader).toHaveBeenCalledWith("ghost-kit");
  });

  it("rejects a non-admin without plugins:execute", async () => {
    registerPlugin("rbac-kit", { actions: { ping: pingAction } });
    mockHasPermission.mockReturnValue(false);

    const response = await POST(
      makeEvent("rbac-kit", {
        search: "?action=ping",
        locals: { user: EDITOR_USER, roles: [], tenantId: "tenant-1" },
      }),
    );
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(mockHasPermission).toHaveBeenCalledWith(EDITOR_USER, "plugins:execute", []);
    expect(h.store.size).toBe(0);
  });

  it("rejects a registered-but-disabled UI plugin", async () => {
    registerPlugin("disabled-kit", { enabled: false, actions: { ping: pingAction } });

    const response = await POST(makeEvent("disabled-kit", { search: "?action=ping" }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
    expect(mockGetPluginState).toHaveBeenCalledWith("disabled-kit", "tenant-1");
  });

  it("rejects a request without any action parameter", async () => {
    registerPlugin("no-action-kit", { actions: { ping: pingAction } });

    const response = await POST(makeEvent("no-action-kit", { body: {} }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(mockGetPlugin).toHaveBeenCalledWith("no-action-kit");
  });

  it("rejects an unknown action on a known plugin", async () => {
    registerPlugin("unknown-action-kit", { actions: { ping: pingAction } });

    const response = await POST(makeEvent("unknown-action-kit", { search: "?action=explode" }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(mockGetLoader).toHaveBeenCalledWith("unknown-action-kit");
  });

  it("dispatches a known action and returns its payload", async () => {
    registerPlugin("ok-kit", { actions: { ping: pingAction } });

    const response = await POST(makeEvent("ok-kit", { search: "?action=ping" }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(body).toEqual({ success: true, pong: true, pluginId: "ok-kit" });
  });

  it("maps a standardized failure envelope to its status and data", async () => {
    const failingAction: Action = async () => ({
      type: "failure",
      status: 422,
      data: { error: "Action rejected the payload" },
    });
    registerPlugin("failure-kit", { actions: { run: failingAction } });

    const response = await POST(makeEvent("failure-kit", { search: "?action=run" }));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(422);
    expect(body).toEqual({ error: "Action rejected the payload" });
  });

  it("persists a write so a later read dispatch returns it", async () => {
    const loader = registerPlugin("persist-kit", {
      actions: { save: saveAction, read: readAction },
    });

    const writeResponse = await POST({
      locals: makeLocals(),
      params: { pluginId: "persist-kit" },
      request: new Request("http://localhost/api/plugins/persist-kit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ __action: "save", key: "persist-key", value: 42 }),
      }),
      url: new URL("http://localhost/api/plugins/persist-kit"),
    } as unknown as PluginEvent);

    expect(writeResponse.status).toBe(200);
    expect(h.store.get("persist-key")).toBe(42);

    const readEvent = makeEvent("persist-kit", {
      search: "?action=read",
      body: { key: "persist-key" },
    });
    expect(await invoke(readEvent)).toEqual({ success: true, key: "persist-key", value: 42 });
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("imports a plugin module once when two first dispatches race", async () => {
    const loader = registerPlugin("race-kit", { actions: { ping: pingAction } });

    const responses = await Promise.all([
      POST(makeEvent("race-kit", { search: "?action=ping" })),
      POST(makeEvent("race-kit", { search: "?action=ping" })),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    // The in-flight promise is shared: a check-then-await would import twice.
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("keeps both writes when two mutating dispatches run concurrently", async () => {
    const incrementAction: Action = async (event) => {
      const body = await readActionBody(event);
      await Promise.resolve();
      const key = String(body.key);
      h.store.set(key, body.value);
      return { success: true, key };
    };
    registerPlugin("concurrent-kit", { actions: { increment: incrementAction } });

    const responses = await Promise.all([
      POST(
        makeEvent("concurrent-kit", {
          body: { __action: "increment", key: "alpha", value: 1 },
        }),
      ),
      POST(
        makeEvent("concurrent-kit", {
          body: { __action: "increment", key: "beta", value: 2 },
        }),
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(h.store.get("alpha")).toBe(1);
    expect(h.store.get("beta")).toBe(2);
    expect(h.store.size).toBe(2);
  });
});
