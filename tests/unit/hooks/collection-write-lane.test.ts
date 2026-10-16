/**
 * @file tests/unit/hooks/collection-write-lane.test.ts
 * @description Shape gate for the warm collection create/update lane.
 *
 * ### Features:
 * - POST collection and PATCH entry match the simple lane
 * - batch, bulk, increment, and status match the extended lane
 * - search and GraphQL queries stay off the collection lane
 * - a changed user-agent steps a warm write up before persist
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wlMocks = vi.hoisted(() => ({
  dbAdapter: {
    connected: true,
    crud: { findPointWireStream: vi.fn(), findListWireStream: vi.fn() },
  } as Record<string, unknown>,
  applyAdapterTenantContext: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@src/databases/db", () => ({
  get dbAdapter() {
    return wlMocks.dbAdapter;
  },
}));
vi.mock("@src/databases/tenant-adapter", () => ({
  applyAdapterTenantContext: wlMocks.applyAdapterTenantContext,
}));
vi.mock("@src/services/sdk", () => ({
  LocalCMS: class {
    collections = { create: wlMocks.create, update: wlMocks.update };
  },
}));

import {
  collectionWriteLaneKind,
  isCollectionWriteLanePath,
  isGraphqlWriteLanePath,
  isSimpleCollectionWrite,
  isSimpleWriteLaneAuthorized,
  resolveWarmWriteSession,
  serveWarmCollectionWrite,
  tryCollectionWriteLane,
  tryGraphqlWriteLane,
} from "@src/hooks/handle-collection-write-lane";
import { PERMISSION_BITS, getRoleBitsetVersion } from "@src/databases/auth/permission-bitmask";
import { isSimpleCollectionRead } from "@src/hooks/handle-collection-read-lane";
import {
  clearTurboAuthCache,
  getTurboAuthContext,
  rememberTurboSessionSurface,
  setTurboAuthContext,
} from "@src/hooks/handle-turbo-get";
import { setSystemState } from "@src/stores/system/state.svelte.ts";
import { AppError } from "@utils/error-handling";
import { createMockEvent } from "./test-utils";
import type { RequestEvent } from "@sveltejs/kit";

beforeEach(() => {
  clearTurboAuthCache();
  (wlMocks as unknown as { dbAdapter: unknown }).dbAdapter = {
    connected: true,
    crud: {},
  };
  wlMocks.applyAdapterTenantContext.mockReset();
  wlMocks.create.mockReset();
  wlMocks.update.mockReset();
  setSystemState("READY");
});

afterEach(() => {
  clearTurboAuthCache();
});

function evt(method: string, pathname: string): RequestEvent {
  return {
    request: { method },
    url: new URL(`http://127.0.0.1${pathname}`),
  } as RequestEvent;
}

describe("isSimpleCollectionWrite", () => {
  it("matches REST create and update", () => {
    expect(isSimpleCollectionWrite(evt("POST", "/api/collections/Articles"))).toBe(true);
    expect(
      isSimpleCollectionWrite(
        evt("PATCH", "/api/collections/Articles/00000000-0000-7000-8000-000000000001"),
      ),
    ).toBe(true);
  });

  it("keeps bulk, search, increment, and reads off the simple lane", () => {
    expect(isSimpleCollectionWrite(evt("GET", "/api/collections/Articles"))).toBe(false);
    expect(isSimpleCollectionWrite(evt("POST", "/api/collections/search"))).toBe(false);
    expect(isSimpleCollectionWrite(evt("POST", "/api/collections/Articles/bulk"))).toBe(false);
    expect(isSimpleCollectionWrite(evt("POST", "/api/graphql"))).toBe(false);
  });
});

describe("extended write lane", () => {
  const id = "00000000-0000-7000-8000-000000000001";

  it("admits batch, bulk, increment, and status", () => {
    expect(collectionWriteLaneKind("POST", "/api/collections/Articles/batch")).toBe("extended");
    expect(collectionWriteLaneKind("POST", "/api/collections/Articles/bulk")).toBe("extended");
    expect(collectionWriteLaneKind("PATCH", "/api/collections/Articles/bulk")).toBe("extended");
    expect(collectionWriteLaneKind("POST", `/api/collections/Articles/${id}/increment`)).toBe(
      "extended",
    );
    expect(collectionWriteLaneKind("PATCH", `/api/collections/Articles/${id}/status`)).toBe(
      "extended",
    );
    expect(isCollectionWriteLanePath(evt("POST", "/api/collections/Articles/batch"))).toBe(true);
  });

  it("leaves search, reorder, schema actions, and single delete on the full pipeline", () => {
    expect(collectionWriteLaneKind("POST", "/api/collections/search")).toBeNull();
    expect(collectionWriteLaneKind("POST", "/api/collections/reorder")).toBeNull();
    expect(collectionWriteLaneKind("POST", "/api/collections/Articles/actions/vote")).toBeNull();
    expect(collectionWriteLaneKind("DELETE", `/api/collections/Articles/${id}`)).toBeNull();
    expect(isGraphqlWriteLanePath(evt("POST", "/api/graphql"))).toBe(true);
    expect(isGraphqlWriteLanePath(evt("GET", "/api/graphql"))).toBe(false);
    expect(isCollectionWriteLanePath(evt("POST", "/api/graphql"))).toBe(false);
  });
});

describe("isSimpleCollectionRead", () => {
  it("matches GET/HEAD of a single entry and collection lists", () => {
    const id = "00000000-0000-7000-8000-000000000001";
    expect(isSimpleCollectionRead(evt("GET", `/api/collections/Articles/${id}`))).toBe(true);
    expect(isSimpleCollectionRead(evt("HEAD", `/api/collections/Articles/${id}`))).toBe(true);
    expect(isSimpleCollectionRead(evt("GET", "/api/collections/Articles"))).toBe(true);
    expect(isSimpleCollectionRead(evt("HEAD", "/api/collections/Articles"))).toBe(true);
  });

  it("rejects actions, search, batch, exports, and writes", () => {
    expect(isSimpleCollectionRead(evt("GET", "/api/collections/Articles/list"))).toBe(false);
    expect(isSimpleCollectionRead(evt("GET", "/api/collections/search"))).toBe(false);
    expect(isSimpleCollectionRead(evt("GET", "/api/collections/Articles/revisions"))).toBe(false);
    expect(isSimpleCollectionRead(evt("GET", "/api/collections/Articles/export"))).toBe(false);
    expect(isSimpleCollectionRead(evt("GET", "/api/collections/Articles?export=csv"))).toBe(false);
    expect(isSimpleCollectionRead(evt("GET", "/api/collections/Articles?stream=true"))).toBe(false);
    expect(isSimpleCollectionRead(evt("POST", "/api/collections/Articles"))).toBe(false);
  });
});

describe("isSimpleWriteLaneAuthorized", () => {
  const editor = { _id: "u-editor", email: "e@test.local", role: "editor" };
  const admin = { _id: "u-admin", email: "a@test.local", role: "admin" };

  it("admits an admin even without a permission bit", () => {
    expect(isSimpleWriteLaneAuthorized({ user: admin })).toBe(true);
  });

  it("admits an editor carrying a fresh collections:write bit", () => {
    expect(
      isSimpleWriteLaneAuthorized({
        user: editor,
        permMask: PERMISSION_BITS["collections:write"],
        permRev: getRoleBitsetVersion(),
      }),
    ).toBe(true);
  });

  it("declines an editor without the write bit (falls through to the pipeline)", () => {
    expect(
      isSimpleWriteLaneAuthorized({
        user: editor,
        permMask: 0n,
        permRev: getRoleBitsetVersion(),
      }),
    ).toBe(false);
    expect(isSimpleWriteLaneAuthorized({ user: editor })).toBe(false);
  });

  it("declines a stale bitset even with the right bit", () => {
    expect(
      isSimpleWriteLaneAuthorized({
        user: editor,
        permMask: PERMISSION_BITS["collections:write"],
        permRev: getRoleBitsetVersion() + 1,
      }),
    ).toBe(false);
  });
});

describe("warm collection write step-up", () => {
  it("rejects a warm write when the user-agent no longer matches the session", async () => {
    const sessionId = "write-lane-step-up";
    clearTurboAuthCache();
    setTurboAuthContext(
      sessionId,
      { _id: "user-1", email: "lane@test.local", role: "editor" } as never,
      [],
      null,
    );
    rememberTurboSessionSurface(sessionId, "127.0.0.1", "UA-Chrome/Stored");
    const turbo = getTurboAuthContext(sessionId);
    expect(turbo).not.toBeNull();

    const event = createMockEvent("/api/collections/posts", {
      method: "POST",
      sessionCookie: sessionId,
      userAgent: "UA-Firefox/New",
      cookies: { csrf_token: "unit-csrf-token" },
      headers: { "x-csrf-token": "unit-csrf-token" },
    });

    const res = await serveWarmCollectionWrite(event, turbo!);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "SESSION_RISK_STEP_UP" });
    clearTurboAuthCache();
  });
});

describe("collectionWriteLaneKind branch coverage", () => {
  const id = "00000000-0000-7000-8000-000000000001";

  it("returns null for non-collection and malformed paths", () => {
    expect(collectionWriteLaneKind("POST", "/api/content/Articles")).toBeNull();
    expect(collectionWriteLaneKind("POST", "/api/collections")).toBeNull();
    expect(collectionWriteLaneKind("POST", "/api/collections/")).toBeNull();
    expect(collectionWriteLaneKind("POST", "/api/collections//")).toBeNull();
  });

  it("keeps every reserved collection id off the lane", () => {
    expect(collectionWriteLaneKind("POST", "/api/collections/reorder")).toBeNull();
    expect(collectionWriteLaneKind("POST", "/api/collections/warm-cache")).toBeNull();
    expect(collectionWriteLaneKind("POST", "/api/collections/list")).toBeNull();
  });

  it("recognizes batch-clone and rejects an unknown single segment", () => {
    expect(collectionWriteLaneKind("POST", "/api/collections/Articles/batch-clone")).toBe(
      "extended",
    );
    expect(collectionWriteLaneKind("POST", "/api/collections/Articles/unknown")).toBeNull();
  });

  it("keeps batch and batch-clone PATCH on the full pipeline", () => {
    expect(collectionWriteLaneKind("PATCH", "/api/collections/Articles/batch")).toBeNull();
    expect(collectionWriteLaneKind("PATCH", "/api/collections/Articles/batch-clone")).toBeNull();
  });

  it("rejects trailing content after a sub-action and wrong methods", () => {
    expect(
      collectionWriteLaneKind("POST", `/api/collections/Articles/${id}/increment/extra`),
    ).toBeNull();
    expect(
      collectionWriteLaneKind("PATCH", `/api/collections/Articles/${id}/status/extra`),
    ).toBeNull();
    expect(
      collectionWriteLaneKind("PATCH", `/api/collections/Articles/${id}/increment`),
    ).toBeNull();
    expect(collectionWriteLaneKind("GET", `/api/collections/Articles/${id}/status`)).toBeNull();
  });

  it("treats PUT like PATCH for simple and extended writes", () => {
    expect(collectionWriteLaneKind("PUT", `/api/collections/Articles/${id}`)).toBe("simple");
    expect(collectionWriteLaneKind("PUT", "/api/collections/Articles/bulk")).toBe("extended");
    expect(collectionWriteLaneKind("PUT", `/api/collections/Articles/${id}/status`)).toBe(
      "extended",
    );
  });

  it("handles a trailing slash after the collection id", () => {
    expect(collectionWriteLaneKind("POST", "/api/collections/Articles/")).toBeNull();
  });

  it("recognizes the graphql trailing-slash variant", () => {
    expect(isGraphqlWriteLanePath(evt("POST", "/api/graphql/"))).toBe(true);
  });
});

describe("resolveWarmWriteSession", () => {
  it("returns null for a cold session", () => {
    const event = createMockEvent("/api/collections/Articles", {
      method: "POST",
      sessionCookie: null,
    });
    expect(resolveWarmWriteSession(event)).toBeNull();
  });

  it("resolves a warm session from the cookie", () => {
    clearTurboAuthCache();
    const sessionId = "warm-session-id";
    setTurboAuthContext(sessionId, { _id: "u1", role: "admin" } as never, [], null);
    const event = createMockEvent("/api/collections/Articles", {
      method: "POST",
      sessionCookie: sessionId,
    });
    expect(resolveWarmWriteSession(event)).not.toBeNull();
  });
});

describe("isSimpleWriteLaneAuthorized explicit isAdmin flag", () => {
  const editor = { _id: "u-editor", email: "e@test.local", role: "editor" };

  it("admits when the caller explicitly passes isAdmin", () => {
    expect(isSimpleWriteLaneAuthorized({ user: editor, isAdmin: true })).toBe(true);
  });

  it("declines when the caller explicitly passes isAdmin false", () => {
    expect(isSimpleWriteLaneAuthorized({ user: editor, isAdmin: false })).toBe(false);
  });
});

describe("serveWarmCollectionWrite success and error paths", () => {
  it("creates a collection entry as an admin", async () => {
    clearTurboAuthCache();
    const sessionId = "write-lane-success";
    setTurboAuthContext(
      sessionId,
      { _id: "admin-1", email: "a@test.local", role: "admin" } as never,
      [],
      null,
    );
    const turbo = getTurboAuthContext(sessionId);
    expect(turbo).not.toBeNull();

    wlMocks.create.mockResolvedValue({ success: true, data: { _id: "entry-1", title: "x" } });

    const event = createMockEvent("/api/collections/posts", {
      method: "POST",
      sessionCookie: sessionId,
      cookies: { csrf_token: "unit-csrf-token" },
      headers: { "x-csrf-token": "unit-csrf-token" },
    });
    (event.locals as unknown as Record<string, unknown>).__parsedJsonBody = { title: "x" };

    const res = await serveWarmCollectionWrite(event, turbo!);
    expect(res.status).toBe(201);
    expect(wlMocks.create).toHaveBeenCalledTimes(1);
    expect(await res.json()).toMatchObject({ success: true });
    clearTurboAuthCache();
  });

  it("returns the API error envelope when the write throws", async () => {
    clearTurboAuthCache();
    const sessionId = "write-lane-error";
    setTurboAuthContext(
      sessionId,
      { _id: "admin-2", email: "a2@test.local", role: "admin" } as never,
      [],
      null,
    );
    const turbo = getTurboAuthContext(sessionId)!;

    wlMocks.create.mockRejectedValue(new AppError("boom", 500, "INTERNAL_ERROR"));

    const event = createMockEvent("/api/collections/posts", {
      method: "POST",
      sessionCookie: sessionId,
      cookies: { csrf_token: "unit-csrf-token" },
      headers: { "x-csrf-token": "unit-csrf-token" },
    });
    (event.locals as unknown as Record<string, unknown>).__parsedJsonBody = { title: "x" };

    const res = await serveWarmCollectionWrite(event, turbo);
    expect(res.status).toBe(500);
    clearTurboAuthCache();
  });
});

describe("tryCollectionWriteLane", () => {
  it("falls through for non-collection paths", async () => {
    const resolve = vi.fn().mockResolvedValue(new Response("ok"));
    const event = createMockEvent("/api/system/health", { method: "POST" });
    const res = await tryCollectionWriteLane({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
    expect(res.status).toBe(200);
  });

  it("falls through when dbAdapter is absent", async () => {
    (wlMocks as unknown as { dbAdapter: unknown }).dbAdapter = null;
    const resolve = vi.fn().mockResolvedValue(new Response("ok"));
    const event = createMockEvent("/api/collections/posts", { method: "POST" });
    await tryCollectionWriteLane({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
  });

  it("falls through when the lane is not serving", async () => {
    setSystemState("MAINTENANCE");
    const resolve = vi.fn().mockResolvedValue(new Response("ok"));
    const event = createMockEvent("/api/collections/posts", { method: "POST" });
    await tryCollectionWriteLane({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
    setSystemState("READY");
  });

  it("falls through for a cold session", async () => {
    const resolve = vi.fn().mockResolvedValue(new Response("ok"));
    const event = createMockEvent("/api/collections/posts", {
      method: "POST",
      sessionCookie: null,
    });
    await tryCollectionWriteLane({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
  });

  it("falls through for a non-admin on an extended route", async () => {
    clearTurboAuthCache();
    const sessionId = "editor-extended";
    setTurboAuthContext(sessionId, { _id: "editor-1", role: "editor" } as never, [], null);
    const resolve = vi.fn().mockResolvedValue(new Response("ok"));
    const event = createMockEvent("/api/collections/posts/batch", {
      method: "POST",
      sessionCookie: sessionId,
    });
    await tryCollectionWriteLane({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
  });

  it("falls through for an unauthorized editor on a simple route", async () => {
    clearTurboAuthCache();
    const sessionId = "editor-simple";
    setTurboAuthContext(sessionId, { _id: "editor-2", role: "editor" } as never, [], null);
    const resolve = vi.fn().mockResolvedValue(new Response("ok"));
    const event = createMockEvent("/api/collections/posts", {
      method: "POST",
      sessionCookie: sessionId,
    });
    await tryCollectionWriteLane({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
  });

  it("serves an admin simple write without falling through", async () => {
    clearTurboAuthCache();
    const sessionId = "admin-write";
    setTurboAuthContext(sessionId, { _id: "admin-3", role: "admin" } as never, [], null);
    wlMocks.create.mockResolvedValue({ success: true, data: { _id: "e1" } });

    const resolve = vi.fn();
    const event = createMockEvent("/api/collections/posts", {
      method: "POST",
      sessionCookie: sessionId,
      cookies: { csrf_token: "unit-csrf-token" },
      headers: { "x-csrf-token": "unit-csrf-token" },
    });
    (event.locals as unknown as Record<string, unknown>).__parsedJsonBody = { title: "x" };

    const res = await tryCollectionWriteLane({ event, resolve });
    expect(res.status).toBe(201);
    expect(wlMocks.create).toHaveBeenCalledTimes(1);
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("tryGraphqlWriteLane", () => {
  it("falls through for non-graphql paths", async () => {
    const resolve = vi.fn().mockResolvedValue(new Response("ok"));
    const event = createMockEvent("/api/collections/posts", { method: "POST" });
    await tryGraphqlWriteLane({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
  });

  it("falls through when dbAdapter is absent", async () => {
    (wlMocks as unknown as { dbAdapter: unknown }).dbAdapter = null;
    const resolve = vi.fn().mockResolvedValue(new Response("ok"));
    const event = createMockEvent("/api/graphql", { method: "POST" });
    await tryGraphqlWriteLane({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
  });

  it("falls through when the lane is not serving", async () => {
    setSystemState("MAINTENANCE");
    const resolve = vi.fn().mockResolvedValue(new Response("ok"));
    const event = createMockEvent("/api/graphql", { method: "POST" });
    await tryGraphqlWriteLane({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
    setSystemState("READY");
  });

  it("falls through for a cold session", async () => {
    const resolve = vi.fn().mockResolvedValue(new Response("ok"));
    const event = createMockEvent("/api/graphql", { method: "POST", sessionCookie: null });
    await tryGraphqlWriteLane({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
  });

  it("falls through for a non-admin", async () => {
    clearTurboAuthCache();
    const sessionId = "editor-graphql";
    setTurboAuthContext(sessionId, { _id: "editor-1", role: "editor" } as never, [], null);
    const resolve = vi.fn().mockResolvedValue(new Response("ok"));
    const event = createMockEvent("/api/graphql", { method: "POST", sessionCookie: sessionId });
    await tryGraphqlWriteLane({ event, resolve });
    expect(resolve).toHaveBeenCalledWith(event);
  });

  it("rejects a warm admin graphql write with session step-up", async () => {
    clearTurboAuthCache();
    const sessionId = "graphql-step-up";
    setTurboAuthContext(sessionId, { _id: "admin-1", role: "admin" } as never, [], null);
    rememberTurboSessionSurface(sessionId, "127.0.0.1", "UA-Chrome/Stored");

    const resolve = vi.fn();
    const event = createMockEvent("/api/graphql", {
      method: "POST",
      sessionCookie: sessionId,
      userAgent: "UA-Firefox/New",
      cookies: { csrf_token: "unit-csrf-token" },
      headers: { "x-csrf-token": "unit-csrf-token" },
    });

    const res = await tryGraphqlWriteLane({ event, resolve });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "SESSION_RISK_STEP_UP" });
    expect(resolve).not.toHaveBeenCalled();
  });
});
