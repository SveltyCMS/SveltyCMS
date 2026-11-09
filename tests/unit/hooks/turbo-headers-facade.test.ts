/**
 * @file tests/unit/hooks/turbo-headers-facade.test.ts
 * @description
 * The fast-lane turbo response is a duck-typed `Response` (no real `Headers`),
 * and `responseToLaneResult()` merges its LIVE headers over the captured
 * snapshot. That merge calls `forEach`; a facade exposing only `get`/`set` made
 * it throw, and the lane registry swallowed the error and re-served every warm
 * turbo hit through the bridged pipeline — the raw read lane silently degraded
 * while responses stayed byte-identical.
 *
 * ### Features:
 * - WHATWG header semantics on the record-backed facade (case-insensitive names,
 *   multi-value join, append/set/has/delete)
 * - pins that `serveTurboCacheEntry` in fast-lane mode exposes `forEach`, the
 *   exact surface the lane merge consumes
 */

import { describe, expect, it } from "vitest";
import { createFastHeaders, serveTurboCacheEntry } from "@src/hooks/handle-turbo-get";

describe("fast-lane header facade", () => {
  it("behaves like Headers for the operations the lane uses", () => {
    const facade = createFastHeaders({
      "content-type": "application/json",
      "set-cookie": ["a=1", "b=2"],
    });

    // Case-insensitive reads; a multi-value entry joins WHATWG-style.
    expect(facade.get("Content-Type")).toBe("application/json");
    expect(facade.get("SET-COOKIE")).toBe("a=1, b=2");
    expect(facade.get("x-absent")).toBeNull();
    expect(facade.has("Content-Type")).toBe(true);

    // `set` replaces, `append` accumulates into the multi-value form.
    facade.set("X-Custom", "one");
    facade.append("X-Custom", "two");
    expect(facade.get("x-custom")).toBe("one, two");

    facade.delete("X-Custom");
    expect(facade.has("x-custom")).toBe(false);

    const seen = new Map<string, string>();
    facade.forEach((value, name) => seen.set(name, value));
    expect(seen.get("content-type")).toBe("application/json");
    expect(seen.get("set-cookie")).toBe("a=1, b=2");
    expect([...facade.keys()].sort()).toEqual(["content-type", "set-cookie"]);
    expect([...facade.entries()]).toHaveLength(2);
    expect([...facade]).toHaveLength(2);
  });

  it("exposes forEach on the response the turbo lane actually hands back", () => {
    const url = new URL("http://localhost/api/collections/posts/entry-1");
    const res = serveTurboCacheEntry(
      { request: new Request(url), url, locals: { __isFastLane: true } },
      { body: '{"_id":"entry-1"}', etag: '"etag-1"' } as never,
    );

    // The exact call `responseToLaneResult()` makes. Before the facade carried
    // `forEach`, this threw and the lane fell back for every warm hit.
    const merged: Record<string, string> = {};
    expect(() =>
      res.headers.forEach((value, name) => {
        merged[name] = value;
      }),
    ).not.toThrow();
    expect(String(merged.etag)).toBe('"etag-1"');
    expect(merged["content-type"]).toBe("application/json");
  });

  it("still serves a conditional 304 through the facade", () => {
    const url = new URL("http://localhost/api/collections/posts/entry-1");
    const request = new Request(url, { headers: { "if-none-match": '"etag-1"' } });
    const res = serveTurboCacheEntry({ request, url, locals: { __isFastLane: true } }, {
      body: '{"_id":"entry-1"}',
      etag: '"etag-1"',
    } as never);

    expect(res.status).toBe(304);
    expect(res.headers.get("etag")).toBe('"etag-1"');
    expect(res.headers.get("content-length")).toBeNull();
  });
});
