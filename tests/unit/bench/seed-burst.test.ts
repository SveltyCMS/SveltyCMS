/**
 * @file tests/unit/bench/seed-burst.test.ts
 * @description Dataset-integrity gate, transient retry and the bulk/per-item
 * lanes of HTTP seed bursts.
 *
 * Features:
 * - batch lane posts `POST …/bulk` and preserves payload order in the returned ids
 * - batch lane retries 401/408 and still fills the requested count
 * - a rejected/unusable bulk chunk degrades to per-item creates (never silent loss)
 * - `chunkSize: 1` reproduces the per-item create lane
 * - throws when the burst cannot reach the requested count
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { seedHttpCollectionBurst } from "../../benchmarks/modules/seed-burst";

const ok = (id: string) =>
  new Response(JSON.stringify({ success: true, data: { _id: id } }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });

const bulkOk = (ids: string[]) =>
  new Response(JSON.stringify({ success: true, data: ids.map((_id) => ({ _id })) }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });

describe("seedHttpCollectionBurst", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds through the batch lane and keeps payload order", async () => {
    const calls: Array<{ url: string; body: unknown[] }> = [];
    let batch = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init: { body: string }) => {
        calls.push({ url, body: JSON.parse(init.body) as unknown[] });
        batch++;
        return bulkOk([`chunk-${batch}-0`, `chunk-${batch}-1`]);
      }),
    );

    const ids = await seedHttpCollectionBurst({
      url: "http://127.0.0.1/api/collections/posts",
      headers: {},
      count: 4,
      concurrency: 1,
      chunkSize: 2,
      payloadAt: (i) => ({ title: `t${i}` }),
      retryDelayMultiplier: 0,
    });

    expect(ids).toEqual(["chunk-1-0", "chunk-1-1", "chunk-2-0", "chunk-2-1"]);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.url).toBe("http://127.0.0.1/api/collections/posts/bulk");
    expect(calls[1]!.body).toEqual([{ title: "t2" }, { title: "t3" }]);
  });

  it("retries 401 then 408 on a chunk and still fills the requested count", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        n++;
        if (n === 1) return new Response("expired", { status: 401 });
        if (n === 2) return new Response(null, { status: 408 });
        return bulkOk(["id-1"]);
      }),
    );

    const ids = await seedHttpCollectionBurst({
      url: "http://127.0.0.1/api/collections/posts",
      headers: { "content-type": "application/json" },
      count: 1,
      concurrency: 1,
      payloadAt: () => ({ title: "t" }),
      retryDelayMultiplier: 0,
    });
    expect(ids).toEqual(["id-1"]);
    expect(n).toBe(3);
  });

  it("falls back to per-item creates when a chunk response is unusable", async () => {
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        if (url.endsWith("/bulk")) return ok("not-an-array");
        return ok(`per-item-${urls.length}`);
      }),
    );

    const ids = await seedHttpCollectionBurst({
      url: "http://127.0.0.1/api/collections/posts",
      headers: {},
      count: 2,
      concurrency: 1,
      chunkSize: 2,
      payloadAt: () => ({ title: "t" }),
      retryDelayMultiplier: 0,
    });

    expect(urls[0]).toBe("http://127.0.0.1/api/collections/posts/bulk");
    expect(urls.filter((u) => u.endsWith("/bulk"))).toHaveLength(1);
    expect(ids).toHaveLength(2);
  });

  it("keeps the per-item lane with chunkSize: 1", async () => {
    let n = 0;
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        urls.push(url);
        n++;
        if (n === 1) return new Response("expired", { status: 401 });
        if (n === 2) return new Response(null, { status: 408 });
        return ok(`id-${n}`);
      }),
    );

    const ids = await seedHttpCollectionBurst({
      url: "http://127.0.0.1/api/collections/posts",
      headers: { "content-type": "application/json" },
      count: 1,
      concurrency: 1,
      chunkSize: 1,
      payloadAt: () => ({ title: "t" }),
      retryDelayMultiplier: 0,
    });
    expect(ids).toHaveLength(1);
    expect(n).toBe(3);
    expect(urls.every((u) => !u.endsWith("/bulk"))).toBe(true);
  });

  it("throws when the burst cannot reach the requested count", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    await expect(
      seedHttpCollectionBurst({
        url: "http://127.0.0.1/api/collections/posts",
        headers: {},
        count: 2,
        concurrency: 1,
        payloadAt: () => ({}),
        retryDelayMultiplier: 0,
      }),
    ).rejects.toThrow(/Dataset integrity: seeded 0\/2/);
  });
});
