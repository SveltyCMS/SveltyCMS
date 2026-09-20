/**
 * @file tests/unit/hooks/collection-write-lane.test.ts
 * @description Shape gate for the warm collection create/update lane.
 *
 * ### Features:
 * - POST collection and PATCH entry match
 * - bulk/search/increment fall through to the full pipeline
 */

import { describe, expect, it } from "vitest";
import { isSimpleCollectionWrite } from "@src/hooks/handle-collection-write-lane";
import { isSimpleCollectionRead } from "@src/hooks/handle-collection-read-lane";
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
        evt("PATCH", "/api/collections/Articles/00000000-0000-4000-8000-000000000001"),
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
    const id = "00000000-0000-4000-8000-000000000001";
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
