/**
 * @file tests/unit/auth/revocation-read-path.test.ts
 * @description Distributed revocation READ path: a tenant, global, or user marker
 * published by one node must invalidate the sessions held by every other node.
 *
 * The in-process epochs only know what THIS process observed, so a "node B" here
 * is a fresh module graph (empty epochs, empty read memo) sharing one cache.
 *
 * Features:
 * - Tenant marker published on node A invalidates a node B session issued before it
 * - Global marker published on node A invalidates every node B session
 * - Issued-at ordering: a marker after the issue is honoured, a later session survives
 * - Cache failure is fail-open (never revokes); a positive marker never fails open
 * - The user-marker path keeps its key/namespace and still revokes a warm session
 * - No tenant id ⇒ no tenant-marker round-trip (zero-cost discipline)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { dateToISODateString } from "@utils/date";
import type { DatabaseId, User } from "@src/databases/db-interface";

/**
 * Shared cache stand-in: every module graph resolves `cacheService` to these
 * spies, the way workers share one Redis. Reset per test.
 */
const cache = vi.hoisted(() => {
  const store = new Map<string, { value: unknown; ttl: number }>();
  const key = (name: string, tenantId?: string | null) => `${tenantId ?? "default"}:${name}`;
  return {
    store,
    get: vi.fn(
      async (name: string, tenantId?: string | null) =>
        store.get(key(name, tenantId))?.value ?? null,
    ),
    set: vi.fn(async (name: string, value: unknown, ttl: number, tenantId?: string | null) => {
      store.set(key(name, tenantId), { value, ttl });
    }),
    remove: vi.fn(async (name: string, tenantId?: string | null) => {
      store.delete(key(name, tenantId));
    }),
  };
});

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: cache.get,
    getSync: vi.fn(() => null),
    set: cache.set,
    setWithCategory: vi.fn(async () => {}),
    delete: cache.remove,
    clearByTags: vi.fn(async () => {}),
    clearByPattern: vi.fn(async () => true),
    invalidateAll: vi.fn(async () => {}),
    invalidateByCategory: vi.fn(async () => {}),
    isNegativeHit: vi.fn(() => false),
    recordMiss: vi.fn(),
  },
  SESSION_CACHE_TTL_MS: 3_600_000,
}));

/** Persistent adapter double — the hook's `dbAdapter`/`auth` bindings stay stable. */
const db = vi.hoisted(() => ({
  auth: {
    getSessionTokenData: vi.fn(),
    getUserById: vi.fn(),
  },
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: { auth: db.auth },
  auth: {
    validateSession: vi.fn(),
    getUserById: vi.fn(),
    createSession: vi.fn(),
    destroySession: vi.fn(),
  },
  getDbInitPromise: vi.fn(() => Promise.resolve()),
  getDb: vi.fn(() => ({ auth: db.auth })),
  isDbConnected: vi.fn(() => true),
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn(() => undefined),
  getPublicSettingSync: vi.fn(() => undefined),
}));

type PublishModule = typeof import("@src/databases/auth/revocation-publish.server");
type EpochModule = typeof import("@src/databases/auth/revocation-epoch");
type SessionModule = typeof import("@src/databases/auth/session-manager");

interface NodeRuntime {
  publish: PublishModule;
  epoch: EpochModule;
  sessions: SessionModule;
}

/**
 * Loads a fresh module graph = a separate process: module-local epochs, pruning
 * maps, and the distributed read memo all start empty while the cache is shared.
 */
async function loadNode(): Promise<NodeRuntime> {
  vi.resetModules();
  return {
    publish: await import("@src/databases/auth/revocation-publish.server"),
    epoch: await import("@src/databases/auth/revocation-epoch"),
    sessions: await import("@src/databases/auth/session-manager"),
  };
}

/**
 * Loads the publishing module in its own graph, so its in-process epoch is
 * "node A" and cannot help the reader under test.
 */
async function loadPublisher(): Promise<PublishModule> {
  vi.resetModules();
  return await import("@src/databases/auth/revocation-publish.server");
}

const inOneHour = () => dateToISODateString(new Date(Date.now() + 3_600_000));

function makeUser(overrides: Partial<User> = {}): User {
  return {
    _id: "user-1" as DatabaseId,
    email: "editor@example.com",
    role: "editor",
    permissions: [],
    tenantId: "tenant-alpha" as DatabaseId,
    createdAt: dateToISODateString(new Date()),
    updatedAt: dateToISODateString(new Date()),
    ...overrides,
  };
}

describe("session store honours distributed revocation markers (node B)", () => {
  beforeEach(() => {
    cache.store.clear();
    vi.clearAllMocks();
    vi.resetModules();
    vi.doUnmock("@src/databases/auth/session-manager");
  });

  it("evicts a session issued before a tenant marker published on node A", async () => {
    const nodeA = await loadNode();
    const epoch = await nodeA.publish.publishTenantRevocation("tenant-alpha");
    expect(epoch).toBeGreaterThan(0);

    const nodeB = await loadNode();
    const issuedBefore = epoch - 60_000;
    // Node B never saw the revoke: its in-process epoch still accepts the session.
    expect(nodeB.epoch.isSessionRevoked(issuedBefore, "user-1", "tenant-alpha")).toBe(false);

    const manager = new nodeB.sessions.InMemorySessionManager();
    await manager.set("session-tenant-get", makeUser(), inOneHour(), { issuedAtMs: issuedBefore });
    await manager.set("session-tenant-data", makeUser(), inOneHour(), {
      issuedAtMs: issuedBefore,
    });

    expect(await manager.get("session-tenant-get")).toBeNull();
    expect(await manager.getSessionData("session-tenant-data")).toBeNull();
  });

  it("evicts every tenant's session when a global marker is published on node A", async () => {
    const nodeA = await loadNode();
    const epoch = await nodeA.publish.publishGlobalRevocation();

    const nodeB = await loadNode();
    const issuedBefore = epoch - 60_000;
    expect(nodeB.epoch.isSessionRevoked(issuedBefore, "user-1", "tenant-alpha")).toBe(false);

    const manager = new nodeB.sessions.InMemorySessionManager();
    await manager.set("session-global-a", makeUser(), inOneHour(), { issuedAtMs: issuedBefore });
    await manager.set(
      "session-global-b",
      makeUser({ _id: "user-2" as DatabaseId, tenantId: "tenant-beta" as DatabaseId }),
      inOneHour(),
      { issuedAtMs: issuedBefore },
    );

    expect(await manager.get("session-global-a")).toBeNull();
    expect(await manager.getSessionData("session-global-b")).toBeNull();
  });

  it("honours a marker published after the issue and keeps a later session", async () => {
    const nodeA = await loadNode();
    const epoch = await nodeA.publish.publishTenantRevocation("tenant-alpha");

    const nodeB = await loadNode();
    const manager = new nodeB.sessions.InMemorySessionManager();
    // Issued before the marker → invalid; issued after it → still valid.
    await manager.set("session-before", makeUser(), inOneHour(), { issuedAtMs: epoch - 5_000 });
    await manager.set("session-after", makeUser(), inOneHour(), { issuedAtMs: epoch + 5_000 });

    expect(await manager.get("session-before")).toBeNull();
    expect(await manager.get("session-after")).not.toBeNull();
  });

  it("does not revoke when the marker read fails, and never ignores a positive marker", async () => {
    const nodeA = await loadNode();
    await nodeA.publish.publishTenantRevocation("tenant-alpha");

    const nodeB = await loadNode();
    // First read (the tenant scope) fails; the local epoch is empty, so the
    // session must survive instead of logging every user out.
    cache.get.mockRejectedValueOnce(new Error("cache down"));

    const manager = new nodeB.sessions.InMemorySessionManager();
    const issuedBefore = Date.now() - 60_000;
    await manager.set("session-cache-down", makeUser(), inOneHour(), { issuedAtMs: issuedBefore });
    expect(await manager.get("session-cache-down")).not.toBeNull();

    // A positive marker on a healthy read is always honoured (no fail-open).
    const nodeC = await loadNode();
    const managerC = new nodeC.sessions.InMemorySessionManager();
    await managerC.set("session-healthy", makeUser(), inOneHour(), { issuedAtMs: issuedBefore });
    expect(await managerC.get("session-healthy")).toBeNull();
  });

  it("skips the tenant-marker round-trip when the session has no tenant id", async () => {
    const node = await loadNode();
    const manager = new node.sessions.InMemorySessionManager();
    await manager.set("session-tenantless", makeUser({ tenantId: null }), inOneHour(), {
      issuedAtMs: Date.now() - 60_000,
    });

    expect(await manager.get("session-tenantless")).not.toBeNull();

    const keys = cache.get.mock.calls.map(([name]) => name);
    expect(keys).toContain("auth:revoke:global");
    expect(keys.some((name) => name.startsWith("auth:revoke:tenant:"))).toBe(false);
  });
});

/** Store double: the hook's store layer is a miss, so the DB/validator path runs. */
const emptyStore = {
  getSessionData: async () => null,
  get: async () => null,
  set: async () => {},
  delete: async () => {},
  deletePattern: async () => 0,
  close: async () => {},
};

type HookModule = typeof import("@src/hooks/handle-authentication");
type TurboModule = typeof import("@src/hooks/handle-turbo-get");

interface HookRuntime {
  hook: HookModule;
  turbo: TurboModule;
  epoch: EpochModule;
}

/** Loads the hook as "node B" with a deliberately trivial session store. */
async function loadHookNode(): Promise<HookRuntime> {
  vi.resetModules();
  vi.doMock("@src/databases/auth/session-manager", () => ({
    getDefaultSessionStore: () => emptyStore,
    getDefaultSessionManager: () => emptyStore,
  }));
  return {
    hook: await import("@src/hooks/handle-authentication"),
    turbo: await import("@src/hooks/handle-turbo-get"),
    epoch: await import("@src/databases/auth/revocation-epoch"),
  };
}

function createEvent(
  pathname: string,
  sessionId: string,
  tenantId: string | null = null,
): RequestEvent {
  const url = new URL(pathname, "http://localhost");
  return {
    url,
    request: new Request(url.toString()),
    cookies: {
      get: vi.fn((name: string) => (name === SESSION_COOKIE_NAME ? sessionId : null)),
      set: vi.fn(),
      delete: vi.fn(),
    },
    locals: { user: null, tenantId },
    route: { id: pathname },
    params: {},
    getClientAddress: () => "127.0.0.1",
  } as unknown as RequestEvent;
}

/** DB double: the session row was issued at `issuedAt` and has not changed since. */
function primeSession(user: User, issuedAt: number): void {
  db.auth.getSessionTokenData.mockResolvedValue({
    success: true,
    data: {
      user_id: user._id,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
      createdAt: new Date(issuedAt).toISOString(),
    },
  });
  db.auth.getUserById.mockResolvedValue({ success: true, data: user });
}

async function request(hook: HookRuntime, event: RequestEvent): Promise<void> {
  await hook.hook.handleAuthentication({
    event,
    resolve: vi.fn(async () => new Response("OK")),
  } as unknown as Parameters<HookModule["handleAuthentication"]>[0]);
}

/**
 * Warms the hook's session LRU, then drops the turbo-auth context: a warm turbo
 * entry short-circuits session validation, which is the very path under test.
 */
async function warmSession(
  runtime: HookRuntime,
  pathname: string,
  sessionId: string,
  user: User,
  issuedAt: number,
  tenantId: string | null = null,
): Promise<RequestEvent> {
  primeSession(user, issuedAt);
  const warm = createEvent(pathname, sessionId, tenantId);
  await request(runtime, warm);
  expect(warm.locals.user).not.toBeNull();
  runtime.turbo.invalidateTurboAuthContext(sessionId);
  return warm;
}

describe("handleAuthentication consults all three revocation scopes", () => {
  beforeEach(() => {
    cache.store.clear();
    vi.clearAllMocks();
    vi.doUnmock("@src/databases/auth/session-manager");
  });

  it("revokes a warm session on the user marker (key/namespace unchanged)", async () => {
    const publisher = await loadPublisher();
    const runtime = await loadHookNode();

    const issuedAt = Date.now() - 60_000;
    await warmSession(
      runtime,
      "/dashboard",
      "session-user-marker",
      makeUser({ tenantId: null }),
      issuedAt,
    );

    // "Node A" publishes; this node's in-process epoch stays empty.
    await publisher.publishUserRevocation("user-1");
    expect(cache.store.get("default:auth:revoke:user:user-1")?.value).toBeGreaterThan(0);
    expect(runtime.epoch.isSessionRevoked(issuedAt, "user-1", null)).toBe(false);

    const event = createEvent("/dashboard", "session-user-marker");
    await request(runtime, event);

    expect(event.locals.user).toBeNull();
    expect(event.cookies.delete).toHaveBeenCalled();
  });

  it("revokes a warm session on a tenant marker from another node", async () => {
    const publisher = await loadPublisher();
    const runtime = await loadHookNode();

    const issuedAt = Date.now() - 60_000;
    const user = makeUser({ tenantId: "tenant-alpha" as DatabaseId });
    await warmSession(
      runtime,
      "/dashboard",
      "session-tenant-marker",
      user,
      issuedAt,
      "tenant-alpha",
    );

    await publisher.publishTenantRevocation("tenant-alpha");
    expect(runtime.epoch.isSessionRevoked(issuedAt, "user-1", "tenant-alpha")).toBe(false);

    const event = createEvent("/dashboard", "session-tenant-marker", "tenant-alpha");
    await request(runtime, event);

    expect(event.locals.user).toBeNull();
    expect(event.cookies.delete).toHaveBeenCalled();
  });

  it("revokes a warm session on a global marker from another node", async () => {
    const publisher = await loadPublisher();
    const runtime = await loadHookNode();

    const issuedAt = Date.now() - 60_000;
    await warmSession(
      runtime,
      "/dashboard",
      "session-global-marker",
      makeUser({ tenantId: null }),
      issuedAt,
    );

    await publisher.publishGlobalRevocation();
    expect(runtime.epoch.isSessionRevoked(issuedAt, "user-1", null)).toBe(false);

    const event = createEvent("/dashboard", "session-global-marker");
    await request(runtime, event);

    expect(event.locals.user).toBeNull();
    expect(event.cookies.delete).toHaveBeenCalled();
  });
});
