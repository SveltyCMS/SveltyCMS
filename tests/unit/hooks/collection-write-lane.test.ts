/**
 * @file tests/unit/hooks/collection-write-lane.test.ts
 * @description Shape gate for the warm collection create/update lane.
 *
 * ### Features:
 * - POST collection and PATCH entry match
 * - bulk/search/increment fall through to the full pipeline
 * - a changed user-agent steps a warm write up before persist
 */

import { describe, expect, it } from "vitest";
import {
  isSimpleCollectionWrite,
  serveWarmCollectionWrite,
} from "@src/hooks/handle-collection-write-lane";
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

  it("rejects bulk, search, increment, and reads", () => {
    expect(isSimpleCollectionWrite(evt("GET", "/api/collections/Articles"))).toBe(false);
    expect(isSimpleCollectionWrite(evt("POST", "/api/collections/search"))).toBe(false);
    expect(isSimpleCollectionWrite(evt("POST", "/api/collections/Articles/bulk"))).toBe(false);
    expect(isSimpleCollectionWrite(evt("POST", "/api/graphql"))).toBe(false);
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
