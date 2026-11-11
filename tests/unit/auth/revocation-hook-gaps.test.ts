/**
 * @file tests/unit/auth/revocation-hook-gaps.test.ts
 * @description Revocation coverage for the read paths in `handleAuthentication`
 * that previously skipped it: the distributed `session:<tenant>:<id>` snapshot
 * branch returned a session with no revocation check at all, and the
 * session-store branches never consulted the distributed USER marker (they only
 * inherited tenant/global coverage from `session-manager`).
 *
 * "Node A" publishes the marker through `revocation-publish.server.ts`; "node B"
 * is the hook loaded in a fresh module graph — empty in-process epochs, empty
 * read memo — sharing the one cache, exactly like a second worker.
 *
 * Features:
 * - Snapshot branch rejects a session issued before a user / tenant / global marker
 * - Snapshot branch accepts a session issued after the marker
 * - Store branches (`getSessionData` and legacy `get`) reject on a user marker
 * - A cache failure on the marker read is fail-open (the session stays valid)
 * - A locally-known revoke short-circuits before any marker cache read
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";
import { SESSION_COOKIE_NAME } from "@src/databases/auth/constants";
import { dateToISODateString } from "@utils/date";
import type { DatabaseId, User } from "@src/databases/db-interface";

/** Shared cache stand-in: every module graph resolves `cacheService` to these spies. */
const cache = vi.hoisted(() => {
  const store = new Map<string, { value: unknown; ttl: number }>();
  const toKey = (name: string, tenantId?: string | null) => `${tenantId ?? "default"}:${name}`;
  const read = async (name: string, tenantId?: string | null) =>
    store.get(toKey(name, tenantId))?.value ?? null;
  return {
    store,
    toKey,
    read,
    get: vi.fn(read),
    set: vi.fn(async (name: string, value: unknown, ttl: number, tenantId?: string | null) => {
      store.set(toKey(name, tenantId), { value, ttl });
    }),
    remove: vi.fn(async (name: string, tenantId?: string | null) => {
      store.delete(toKey(name, tenantId));
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

/** DB double — the hook must never need the validator path in these tests. */
const db = vi.hoisted(() => ({
  auth: {
    getSessionTokenData: vi.fn(async () => undefined),
    getUserById: vi.fn(async () => undefined),
  },
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: { auth: db.auth },
  auth: { validateSession: vi.fn(), createSession: vi.fn(), destroySession: vi.fn() },
  getDbInitPromise: vi.fn(() => Promise.resolve()),
  getDb: vi.fn(() => ({ auth: db.auth })),
  isDbConnected: vi.fn(() => true),
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn(() => undefined),
  getPublicSettingSync: vi.fn(() => undefined),
}));

/** Session-store double; `sessionData` drives `getSessionData`, `user` drives `get`. */
const storeState = vi.hoisted(() => ({
  sessionData: null as unknown,
  user: null as unknown,
}));

type PublishModule = typeof import("@src/databases/auth/revocation-publish.server");
type EpochModule = typeof import("@src/databases/auth/revocation-epoch");
type HookModule = typeof import("@src/hooks/handle-authentication");

interface HookRuntime {
  hook: HookModule;
  epoch: EpochModule;
}

/** A fresh graph = a separate worker: in-process epochs and read memo start empty. */
async function loadPublisher(): Promise<PublishModule> {
  vi.resetModules();
  return await import("@src/databases/auth/revocation-publish.server");
}

type StoreShape = "sessionData" | "get";

function buildStore(shape: StoreShape) {
  const base = {
    set: async () => {},
    delete: async () => {},
    deletePattern: async () => 0,
    close: async () => {},
  };
  if (shape === "sessionData") {
    return {
      ...base,
      getSessionData: async () => storeState.sessionData,
      get: async () => null,
    };
  }
  return { ...base, get: async () => storeState.user };
}

/** Loads the hook as "node B" with the requested store shape. */
async function loadHookNode(shape: StoreShape = "sessionData"): Promise<HookRuntime> {
  vi.resetModules();
  vi.doMock("@src/databases/auth/session-manager", () => {
    const store = buildStore(shape);
    return { getDefaultSessionStore: () => store, getDefaultSessionManager: () => store };
  });
  return {
    hook: await import("@src/hooks/handle-authentication"),
    epoch: await import("@src/databases/auth/revocation-epoch"),
  };
}

function makeUser(overrides: Partial<User> = {}): User {
  return {
    _id: "user-1" as DatabaseId,
    email: "editor@example.com",
    role: "editor",
    permissions: [],
    tenantId: null,
    createdAt: dateToISODateString(new Date()),
    updatedAt: dateToISODateString(new Date()),
    ...overrides,
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

interface SnapshotEntry {
  user: User;
  timestamp: number;
  issuedAtMs?: number;
}

/**
 * Writes a distributed `session:<tenant>:<id>` snapshot into the shared cache.
 * The hook builds that key itself AND passes the tenant as the cache namespace.
 */
function seedSnapshot(
  sessionId: string,
  user: User,
  issuedAtMs: number,
  tenantId: string | null = null,
): void {
  const value: SnapshotEntry = { user, timestamp: Date.now(), issuedAtMs };
  const name = tenantId ? `session:${tenantId}:${sessionId}` : `session:${sessionId}`;
  cache.store.set(cache.toKey(name, tenantId), { value, ttl: 3_600_000 });
}

async function request(runtime: HookRuntime, event: RequestEvent): Promise<void> {
  await runtime.hook.handleAuthentication({
    event,
    resolve: vi.fn(async () => new Response("OK")),
  } as unknown as Parameters<HookModule["handleAuthentication"]>[0]);
}

/** Marker cache reads only — the snapshot read itself also goes through `cache.get`. */
function markerReads(): string[] {
  return cache.get.mock.calls
    .map(([name]) => String(name))
    .filter((name) => name.startsWith("auth:revoke:"));
}

describe("distributed snapshot branch honours revocation", () => {
  beforeEach(() => {
    cache.store.clear();
    vi.clearAllMocks();
    vi.doUnmock("@src/databases/auth/session-manager");
    cache.get.mockReset();
    cache.get.mockImplementation(cache.read);
    storeState.sessionData = null;
    storeState.user = null;
  });

  it("rejects a snapshot issued before the user marker", async () => {
    const publisher = await loadPublisher();
    const epoch = await publisher.publishUserRevocation("user-1");
    expect(epoch).toBeGreaterThan(0);

    const runtime = await loadHookNode();
    const issuedAt = epoch - 60_000;
    seedSnapshot("snap-user", makeUser(), issuedAt);
    // This worker never observed the revoke: only the distributed marker can reject it.
    expect(runtime.epoch.isSessionRevoked(issuedAt, "user-1", null)).toBe(false);

    const event = createEvent("/dashboard", "snap-user");
    await request(runtime, event);

    expect(event.locals.user).toBeNull();
    expect(event.cookies.delete).toHaveBeenCalled();
  });

  it("rejects a snapshot issued before the tenant marker", async () => {
    const publisher = await loadPublisher();
    const epoch = await publisher.publishTenantRevocation("tenant-alpha");

    const runtime = await loadHookNode();
    const issuedAt = epoch - 60_000;
    seedSnapshot(
      "snap-tenant",
      makeUser({ tenantId: "tenant-alpha" as DatabaseId }),
      issuedAt,
      "tenant-alpha",
    );
    expect(runtime.epoch.isSessionRevoked(issuedAt, "user-1", "tenant-alpha")).toBe(false);

    const event = createEvent("/dashboard", "snap-tenant", "tenant-alpha");
    await request(runtime, event);

    expect(event.locals.user).toBeNull();
    expect(event.cookies.delete).toHaveBeenCalled();
  });

  it("rejects a snapshot issued before the global marker", async () => {
    const publisher = await loadPublisher();
    const epoch = await publisher.publishGlobalRevocation();

    const runtime = await loadHookNode();
    const issuedAt = epoch - 60_000;
    seedSnapshot("snap-global", makeUser(), issuedAt);
    expect(runtime.epoch.isSessionRevoked(issuedAt, "user-1", null)).toBe(false);

    const event = createEvent("/dashboard", "snap-global");
    await request(runtime, event);

    expect(event.locals.user).toBeNull();
    expect(event.cookies.delete).toHaveBeenCalled();
  });

  it("accepts a snapshot issued after the marker", async () => {
    const publisher = await loadPublisher();
    const epoch = await publisher.publishUserRevocation("user-1");

    const runtime = await loadHookNode();
    seedSnapshot("snap-after", makeUser(), epoch + 5_000);

    const event = createEvent("/dashboard", "snap-after");
    await request(runtime, event);

    expect(event.locals.user).not.toBeNull();
    expect((event.locals.user as User)._id).toBe("user-1");
    expect(event.cookies.delete).not.toHaveBeenCalled();
  });
});

describe("session-store branches honour the distributed user marker", () => {
  beforeEach(() => {
    cache.store.clear();
    vi.clearAllMocks();
    vi.doUnmock("@src/databases/auth/session-manager");
    cache.get.mockReset();
    cache.get.mockImplementation(cache.read);
    storeState.sessionData = null;
    storeState.user = null;
  });

  it("rejects a `getSessionData` entry issued before the user marker", async () => {
    const publisher = await loadPublisher();
    const epoch = await publisher.publishUserRevocation("user-1");

    storeState.sessionData = { user: makeUser(), issuedAtMs: epoch - 60_000 };
    const runtime = await loadHookNode("sessionData");

    const event = createEvent("/dashboard", "store-user-marker");
    await request(runtime, event);

    expect(event.locals.user).toBeNull();
    expect(event.cookies.delete).toHaveBeenCalled();
  });

  it("rejects a legacy `get` entry that carries an issue time before the user marker", async () => {
    const publisher = await loadPublisher();
    const epoch = await publisher.publishUserRevocation("user-1");

    storeState.user = { ...makeUser(), issuedAtMs: epoch - 60_000 };
    const runtime = await loadHookNode("get");

    const event = createEvent("/dashboard", "legacy-user-marker");
    await request(runtime, event);

    expect(event.locals.user).toBeNull();
    expect(event.cookies.delete).toHaveBeenCalled();
  });

  it("keeps a store entry issued after the marker", async () => {
    const publisher = await loadPublisher();
    const epoch = await publisher.publishUserRevocation("user-1");

    storeState.sessionData = { user: makeUser(), issuedAtMs: epoch + 5_000 };
    const runtime = await loadHookNode("sessionData");

    const event = createEvent("/dashboard", "store-after-marker");
    await request(runtime, event);

    expect(event.locals.user).not.toBeNull();
    expect(event.cookies.delete).not.toHaveBeenCalled();
  });
});

describe("revocation gate failure semantics", () => {
  beforeEach(() => {
    cache.store.clear();
    vi.clearAllMocks();
    vi.doUnmock("@src/databases/auth/session-manager");
    cache.get.mockReset();
    cache.get.mockImplementation(cache.read);
    storeState.sessionData = null;
    storeState.user = null;
  });

  it("keeps the session valid when the marker read fails", async () => {
    const publisher = await loadPublisher();
    const epoch = await publisher.publishUserRevocation("user-1");

    storeState.sessionData = { user: makeUser(), issuedAtMs: epoch - 60_000 };
    const runtime = await loadHookNode("sessionData");
    // The user-marker read (first cache read on this path) fails; the marker
    // exists, so a healthy read would have rejected the session.
    cache.get.mockRejectedValueOnce(new Error("cache down"));

    const event = createEvent("/dashboard", "store-cache-down");
    await request(runtime, event);

    expect(event.locals.user).not.toBeNull();
    expect(event.cookies.delete).not.toHaveBeenCalled();
  });

  it("short-circuits on a local revoke without reading a marker", async () => {
    const runtime = await loadHookNode("sessionData");
    const issuedAt = Date.now() - 60_000;
    storeState.sessionData = { user: makeUser(), issuedAtMs: issuedAt };
    // The revoke happened on THIS worker, so the in-process epoch knows it.
    runtime.epoch.revokeUserSessions("user-1");
    cache.get.mockClear();

    const event = createEvent("/dashboard", "store-local-revoke");
    await request(runtime, event);

    expect(event.locals.user).toBeNull();
    expect(event.cookies.delete).toHaveBeenCalled();
    expect(markerReads()).toEqual([]);
  });
});
