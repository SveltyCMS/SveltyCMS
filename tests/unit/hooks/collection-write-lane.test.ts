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

import { describe, expect, it } from "vitest";
import {
  collectionWriteLaneKind,
  isCollectionWriteLanePath,
  isGraphqlWriteLanePath,
  isSimpleCollectionWrite,
  isSimpleWriteLaneAuthorized,
  serveWarmCollectionWrite,
} from "@src/hooks/handle-collection-write-lane";
import { PERMISSION_BITS, getRoleBitsetVersion } from "@src/databases/auth/permission-bitmask";
import { isSimpleCollectionRead } from "@src/hooks/handle-collection-read-lane";
import {
  clearTurboAuthCache,
  getTurboAuthContext,
  rememberTurboSessionSurface,
  setTurboAuthContext,
} from "@src/hooks/handle-turbo-get";
import { createMockEvent } from "./test-utils";
import type { RequestEvent } from "@sveltejs/kit";

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
