/**
 * @file tests/unit/sdk/packages-sdk-workspace.test.ts
 * @description Tests the standalone `@sveltycms/sdk` workspace package (REST, GraphQL,
 * Idempotency-Key, If-Match optimistic locking, temporal reads `?asOf=`, draft rollback, and errors).
 */

import { describe, expect, it, vi } from "vitest";
import { SveltyClientError, createSveltyClient } from "../../../packages/sdk/src/index";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("@sveltycms/sdk workspace client", () => {
  it("routes list, temporal findById, idempotent create, optimistic update, draft rollback, and graphql", async () => {
    const calls: Array<{ url: string; method: string; headers: Headers; body?: unknown }> = [];
    const mockFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method || "GET";
      const headers = new Headers(init?.headers);
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ url, method, headers, body });

      if (method === "GET" && url.includes("asOf=2")) {
        return jsonResponse({
          success: true,
          data: { _id: "e1", title: "V2", _revisionVersion: 2 },
        });
      }
      if (method === "GET" && url.includes("/api/collections/posts?")) {
        return jsonResponse({
          success: true,
          data: { items: [{ _id: "e1", title: "Hi" }], total: 1 },
        });
      }
      if (method === "POST" && url.endsWith("/api/collections/posts")) {
        return jsonResponse({ success: true, data: { _id: "e2", title: "New" } }, 201);
      }
      if (method === "PATCH" && url.endsWith("/api/collections/posts/e2")) {
        return jsonResponse({ success: true, data: { _id: "e2", title: "Updated" } });
      }
      if (method === "POST" && url.endsWith("/drafts/rollback")) {
        return jsonResponse({ success: true, data: { _id: "d1", version: 5 } });
      }
      if (method === "POST" && url.endsWith("/api/graphql")) {
        return jsonResponse({ data: { posts: [{ _id: "e1" }] } });
      }
      return jsonResponse({ success: true, data: null });
    });

    const client = createSveltyClient({
      baseUrl: "https://cms.example.com/",
      token: "sck_test_123",
      tenantId: "acme",
      fetch: mockFetch as unknown as typeof fetch,
    });

    const posts = client.collection<{ _id: string; title: string }>("posts");

    const list = await posts.list({ page: 1, limit: 10, fields: ["title"] });
    expect(list.items).toHaveLength(1);
    expect(calls[0].headers.get("Authorization")).toBe("Bearer sck_test_123");
    expect(calls[0].headers.get("x-tenant-id")).toBe("acme");

    const temporal = await posts.findById("e1", { asOf: 2 });
    expect(temporal?.title).toBe("V2");
    expect(calls[1].url).toContain("asOf=2");

    await posts.create({ title: "New" }, { idempotencyKey: "req-idem-1" });
    expect(calls[2].headers.get("Idempotency-Key")).toBe("req-idem-1");

    await posts.update("e2", { title: "Updated" }, { ifMatch: "2026-11-25T00:00:00.000Z" });
    expect(calls[3].headers.get("If-Match")).toBe("2026-11-25T00:00:00.000Z");

    const rolled = await posts.rollbackDraft("e2", 1);
    expect(rolled.version).toBe(5);

    const gql = await client.graphql<{ posts: Array<{ _id: string }> }>("query { posts { _id } }");
    expect(gql.data?.posts[0]._id).toBe("e1");
  });

  it("raises typed SveltyClientError preserving HTTP status, error code, and details", async () => {
    const failingFetch = vi.fn(async () =>
      jsonResponse(
        {
          success: false,
          error: {
            code: "VERSION_CONFLICT",
            message: "Entry was modified concurrently",
            details: { currentVersion: "2026-11-25T10:00:00.000Z" },
          },
        },
        409,
      ),
    );

    const client = createSveltyClient({
      baseUrl: "https://cms.example.com",
      fetch: failingFetch as unknown as typeof fetch,
    });

    let caught: unknown;
    try {
      await client.collection("posts").update("e1", { title: "X" }, { ifMatch: "old-token" });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(SveltyClientError);
    expect((caught as SveltyClientError).status).toBe(409);
    expect((caught as SveltyClientError).code).toBe("VERSION_CONFLICT");
    expect((caught as SveltyClientError).details).toEqual({
      currentVersion: "2026-11-25T10:00:00.000Z",
    });
  });
});
