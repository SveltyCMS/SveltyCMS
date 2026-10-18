/**
 * @file tests/unit/plugins/unified-data-hub/rest-openapi-write.test.ts
 * @description REST connector opt-in write-back tests (mocked egress).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseId, ISODateString } from "@databases/db-interface";
import type { ConnectorRecord } from "@plugins/unified-data-hub/types";
import { RestOpenApiConnector } from "@plugins/unified-data-hub/server/connectors/rest-openapi";
import { resetConnectorCircuit } from "@plugins/unified-data-hub/server/connector-circuit-breaker";

const { safeFetchMock, validateEgressUrlMock } = vi.hoisted(() => ({
  safeFetchMock: vi.fn(),
  validateEgressUrlMock: vi.fn(async (url: string) => new URL(url)),
}));

vi.mock("@utils/egress-guard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@utils/egress-guard")>();
  return {
    ...actual,
    safeFetch: safeFetchMock,
    validateEgressUrl: validateEgressUrlMock,
  };
});

const CONNECTOR_ID = "rest-1" as DatabaseId;
const TENANT = "default" as DatabaseId;
const ISO_NOW = "2026-07-09T00:00:00.000Z" as ISODateString;

const writableRestConnector: ConnectorRecord = {
  _id: CONNECTOR_ID,
  tenantId: TENANT,
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
  createdAt: ISO_NOW,
  updatedAt: ISO_NOW,
};

const collection = {
  _id: "vc1" as DatabaseId,
  tenantId: TENANT,
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
  createdAt: ISO_NOW,
  updatedAt: ISO_NOW,
};

describe("REST connector write-back", () => {
  const connector = new RestOpenApiConnector();

  beforeEach(() => {
    resetConnectorCircuit(String(CONNECTOR_ID));
    safeFetchMock.mockReset();
    validateEgressUrlMock.mockReset();
    validateEgressUrlMock.mockImplementation(async (url: string) => new URL(url));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to read-only capabilities", () => {
    expect(connector.getDefaultCapabilities().writable).toBe(false);
  });

  it("creates entries via POST with Idempotency-Key", async () => {
    safeFetchMock.mockResolvedValue({
      success: true,
      status: 201,
      body: JSON.stringify({ id: 99, title: "Created", slug: "created" }),
    });

    const row = await connector.executeWrite({
      connector: writableRestConnector,
      collection: collection as any,
      operation: "create",
      data: { title: "Created", slug: "created" },
    });

    expect(row?._source.sourceKey).toBe("99");
    expect(validateEgressUrlMock.mock.invocationCallOrder[0]).toBeLessThan(
      safeFetchMock.mock.invocationCallOrder[0],
    );
    const init = safeFetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).title).toBe("Created");
    const headers = init.headers as Record<string, string>;
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
    safeFetchMock.mockResolvedValue({ success: true, status: 200, body: "" });

    await connector.executeWrite({
      connector: writableRestConnector,
      collection: collection as any,
      operation: "delete",
      entryId: `${CONNECTOR_ID}:7`,
    });

    const init = safeFetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("DELETE");
  });
});
