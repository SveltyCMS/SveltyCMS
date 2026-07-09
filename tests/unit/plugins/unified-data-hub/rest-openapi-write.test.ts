/**
 * @file tests/unit/plugins/unified-data-hub/rest-openapi-write.test.ts
 * @description REST connector opt-in write-back tests (mocked egress).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseId } from "@databases/db-interface";
import { RestOpenApiConnector } from "@plugins/unified-data-hub/server/connectors/rest-openapi";
import { resetConnectorCircuit } from "@plugins/unified-data-hub/server/connector-circuit-breaker";

const CONNECTOR_ID = "rest-1" as DatabaseId;

const writableRestConnector = {
  _id: CONNECTOR_ID,
  tenantId: "default",
  name: "WP REST",
  type: "rest" as const,
  enabled: true,
  config: { baseUrl: "https://blog.example.com", writesEnabled: true },
  allowedHosts: ["blog.example.com"],
  credentials: { apiKey: "secret-token" },
  capabilities: {
    filterPushdown: true,
    sortPushdown: true,
    joinable: false as const,
    maxPageSize: 100,
    supportsTransactions: false,
    staleness: "cache" as const,
    writable: true,
  },
  health: "ok" as const,
  createdAt: "2026-07-09T00:00:00.000Z",
  updatedAt: "2026-07-09T00:00:00.000Z",
};

const collection = {
  _id: "vc1" as DatabaseId,
  tenantId: "default",
  name: "Articles",
  slug: "wp-articles",
  connectorId: CONNECTOR_ID,
  source: { endpoint: "/wp-json/wp/v2/posts", platform: "wordpress" as const },
  fields: [
    { name: "id", label: "ID", sourceField: "id", type: "number" },
    { name: "title", label: "Title", sourceField: "title", type: "text" },
    { name: "slug", label: "Slug", sourceField: "slug", type: "text" },
  ],
  enabled: true,
  createdAt: "2026-07-09T00:00:00.000Z",
  updatedAt: "2026-07-09T00:00:00.000Z",
};

describe("REST connector write-back", () => {
  const connector = new RestOpenApiConnector();
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    resetConnectorCircuit(String(CONNECTOR_ID));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("defaults to read-only capabilities", () => {
    expect(connector.getDefaultCapabilities().writable).toBe(false);
  });

  it("creates entries via POST with Idempotency-Key", async () => {
    const calls: RequestInit[] = [];
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      calls.push(init ?? {});
      return {
        ok: true,
        status: 201,
        headers: { get: () => null },
        text: async () => JSON.stringify({ id: 99, title: "Created", slug: "created" }),
      };
    }) as any;

    const row = await connector.executeWrite({
      connector: writableRestConnector,
      collection: collection as any,
      operation: "create",
      data: { title: "Created", slug: "created" },
    });

    expect(row?._source.sourceKey).toBe("99");
    expect(JSON.parse(calls[0].body as string).title).toBe("Created");
    const headers = calls[0].headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBeTruthy();
    expect(headers.Authorization).toBe("Bearer secret-token");
  });

  it("rejects writes when connector capability is not writable", async () => {
    await expect(
      connector.executeWrite({
        connector: {
          ...writableRestConnector,
          capabilities: { ...writableRestConnector.capabilities, writable: false },
        },
        collection: collection as any,
        operation: "create",
        data: { title: "x" },
      }),
    ).rejects.toMatchObject({ code: "CONNECTOR_WRITE_NOT_SUPPORTED" });
  });

  it("deletes entries via DELETE on collection endpoint", async () => {
    let method = "";
    globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      method = init?.method ?? "";
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => "",
      };
    }) as any;

    await connector.executeWrite({
      connector: writableRestConnector,
      collection: collection as any,
      operation: "delete",
      entryId: `${CONNECTOR_ID}:7`,
    });

    expect(method).toBe("DELETE");
  });
});
