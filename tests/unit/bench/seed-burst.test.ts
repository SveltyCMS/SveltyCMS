/**
 * @file tests/unit/bench/seed-burst.test.ts
 * @description Dataset-integrity gate and transient retry for HTTP seed bursts.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { seedHttpCollectionBurst } from "../../benchmarks/modules/seed-burst";

const ok = (id: string) =>
  new Response(JSON.stringify({ success: true, data: { _id: id } }), {
    status: 201,
    headers: { "content-type": "application/json" },
  });

describe("seedHttpCollectionBurst", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("retries 401 then 408 and still fills the requested count", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
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
      payloadAt: () => ({ title: "t" }),
    });
    expect(ids).toHaveLength(1);
    expect(n).toBe(3);
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
      }),
    ).rejects.toThrow(/Dataset integrity: seeded 0\/2/);
  });
});
