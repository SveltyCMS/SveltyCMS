/**
 * @file tests/unit/utils/idempotency.test.ts
 * @description Unit tests for 24h Idempotency-Key request deduplication on POST mutations.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestEvent } from "@sveltejs/kit";

const memCache = new Map<string, unknown>();

vi.mock("@src/databases/cache/types", () => ({
  CacheCategory: { API: "api" },
}));

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    get: vi.fn(async (key: string, tenantId?: string) => {
      return memCache.get(`${tenantId ?? "global"}|${key}`) ?? null;
    }),
    set: vi.fn(async (key: string, val: unknown, _ttl: number, tenantId?: string) => {
      memCache.set(`${tenantId ?? "global"}|${key}`, val);
    }),
  },
}));

import { cacheService } from "@src/databases/cache/cache-service";
import {
  IDEMPOTENCY_TTL_SECONDS,
  fingerprintIdempotentPayload,
  readIdempotencyKey,
  runIdempotentPost,
} from "@utils/idempotency";

function makePostEvent(pathname: string, key?: string, method = "POST"): RequestEvent {
  const headers = new Headers();
  if (key !== undefined) headers.set("Idempotency-Key", key);
  return {
    url: new URL(`http://localhost${pathname}`),
    request: new Request(`http://localhost${pathname}`, { method, headers }),
    locals: {},
  } as unknown as RequestEvent;
}

describe("Idempotency-Key POST deduplication", () => {
  beforeEach(() => {
    memCache.clear();
    vi.clearAllMocks();
  });

  it("bypasses cache with zero lookups when Idempotency-Key header is absent", async () => {
    const event = makePostEvent("/api/collections/posts");
    const execute = vi.fn(async () => new Response('{"id":"1"}', { status: 201 }));

    const res = await runIdempotentPost(event, "t1", { _id: "u1" }, { title: "A" }, execute);

    expect(res.status).toBe(201);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(cacheService.get).not.toHaveBeenCalled();
    expect(cacheService.set).not.toHaveBeenCalled();
    expect(res.headers.get("x-idempotency-replayed")).toBeNull();
  });

  it("rejects oversized Idempotency-Key headers with HTTP 400", () => {
    const req = new Request("http://localhost/api/collections/posts", {
      method: "POST",
      headers: { "Idempotency-Key": "k".repeat(257) },
    });
    expect(() => readIdempotencyKey(req)).toThrowError(expect.objectContaining({ status: 400 }));
  });

  it("caches 2xx response for 24h and replays identical retry without re-executing", async () => {
    const execute = vi.fn(
      async () =>
        new Response(JSON.stringify({ success: true, data: { _id: "post-1" } }), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
    );

    const first = await runIdempotentPost(
      makePostEvent("/api/collections/posts", "req-123"),
      "t1",
      { _id: "u1" },
      { title: "Hello", count: 1 },
      execute,
    );
    expect(first.status).toBe(201);
    expect(first.headers.get("x-idempotency-replayed")).toBeNull();
    expect(cacheService.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ status: 201 }),
      IDEMPOTENCY_TTL_SECONDS,
      "t1",
      "api",
    );

    const retry = await runIdempotentPost(
      makePostEvent("/api/collections/posts", "req-123"),
      "t1",
      { _id: "u1" },
      { count: 1, title: "Hello" }, // reversed key order is still canonically equal
      execute,
    );
    expect(retry.status).toBe(201);
    expect(retry.headers.get("x-idempotency-replayed")).toBe("true");
    expect(await retry.json()).toEqual({ success: true, data: { _id: "post-1" } });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("rejects conflicting payload reuse on same Idempotency-Key with HTTP 409", async () => {
    const execute = vi.fn(async () => new Response('{"ok":true}', { status: 201 }));

    await runIdempotentPost(
      makePostEvent("/api/collections/posts", "req-dup"),
      "t1",
      { _id: "u1" },
      { title: "Original" },
      execute,
    );

    await expect(
      runIdempotentPost(
        makePostEvent("/api/collections/posts", "req-dup"),
        "t1",
        { _id: "u1" },
        { title: "Modified" },
        execute,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent in-flight POST requests with identical key and payload", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn(async () => {
      await gate;
      return new Response('{"created":true}', { status: 201 });
    });

    const p1 = runIdempotentPost(
      makePostEvent("/api/collections/posts", "inflight-1"),
      "t1",
      { _id: "u1" },
      { title: "Concurrent" },
      execute,
    );
    const p2 = runIdempotentPost(
      makePostEvent("/api/collections/posts", "inflight-1"),
      "t1",
      { _id: "u1" },
      { title: "Concurrent" },
      execute,
    );

    release();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(r2.headers.get("x-idempotency-replayed")).toBe("true");
  });

  it("isolates cache entries across tenants, actors, and paths", async () => {
    const execute = vi.fn(async () => new Response('{"ok":true}', { status: 201 }));

    await runIdempotentPost(
      makePostEvent("/api/collections/posts", "shared-key"),
      "tenant-a",
      { _id: "u1" },
      { title: "Post" },
      execute,
    );
    await runIdempotentPost(
      makePostEvent("/api/collections/posts", "shared-key"),
      "tenant-b",
      { _id: "u1" },
      { title: "Different Tenant" },
      execute,
    );
    await runIdempotentPost(
      makePostEvent("/api/collections/pages", "shared-key"),
      "tenant-a",
      { _id: "u1" },
      { title: "Different Collection" },
      execute,
    );
    await runIdempotentPost(
      makePostEvent("/api/collections/posts", "shared-key"),
      "tenant-a",
      { _id: "u2" },
      { title: "Different User" },
      execute,
    );

    expect(execute).toHaveBeenCalledTimes(4);
  });

  it("does not cache non-2xx responses so failed attempts can be retried", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"error":"busy"}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 201 }));

    const r1 = await runIdempotentPost(
      makePostEvent("/api/collections/posts", "retry-5xx"),
      "t1",
      { _id: "u1" },
      { title: "Retry" },
      execute,
    );
    expect(r1.status).toBe(503);
    expect(cacheService.set).not.toHaveBeenCalled();

    const r2 = await runIdempotentPost(
      makePostEvent("/api/collections/posts", "retry-5xx"),
      "t1",
      { _id: "u1" },
      { title: "Retry" },
      execute,
    );
    expect(r2.status).toBe(201);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("canonicalizes nested payload objects deterministically", () => {
    const h1 = fingerprintIdempotentPayload({ a: 1, nested: { y: 2, x: [3, 4] } });
    const h2 = fingerprintIdempotentPayload({ nested: { x: [3, 4], y: 2 }, a: 1 });
    expect(h1).toBe(h2);
  });
});
