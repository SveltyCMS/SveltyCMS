/**
 * @file tests/unit/plugins/unified-data-hub/rest-openapi-egress.test.ts
 * @description SSRF regression tests for the REST connector read/health paths.
 *
 * The connector's `baseUrl` and `allowedHosts` are admin input. Every outbound
 * request must go through `validateEgressUrl` (DNS/private-IP checks) and then
 * `safeFetch` (redirect re-validation, timeout, size cap) — never a raw fetch.
 * Only the egress-guard module boundary is mocked here.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DatabaseId, ISODateString } from "@databases/db-interface";
import type { ConnectorRecord, VirtualCollectionRecord } from "@plugins/unified-data-hub/types";
import type { ConnectorReadContext } from "@plugins/unified-data-hub/server/connectors/base";
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

const CONNECTOR_ID = "rest-egress-1" as DatabaseId;
const TENANT = "default" as DatabaseId;
const ISO_NOW = "2026-07-09T00:00:00.000Z" as ISODateString;

const connectorRecord: ConnectorRecord = {
  _id: CONNECTOR_ID,
  tenantId: TENANT,
  name: "WP REST",
  type: "rest",
  enabled: true,
  config: { baseUrl: "https://blog.example.com" },
  allowedHosts: ["blog.example.com"],
  capabilities: {
    filterPushdown: false,
    sortPushdown: false,
    joinable: false,
    maxPageSize: 100,
    supportsTransactions: false,
    staleness: "cache",
    ttlSeconds: 300,
    writable: false,
  },
  health: "ok",
  createdAt: ISO_NOW,
  updatedAt: ISO_NOW,
};

const collection = {
  _id: "vc-egress-1" as DatabaseId,
  tenantId: TENANT,
  name: "Articles",
  slug: "wp-articles",
  connectorId: String(CONNECTOR_ID),
  source: { endpoint: "/wp-json/wp/v2/posts", platform: "wordpress" },
  fields: [
    { name: "id", label: "ID", sourceField: "id", type: "number" },
    { name: "title", label: "Title", sourceField: "title", type: "text" },
  ],
  enabled: true,
  createdAt: ISO_NOW,
  updatedAt: ISO_NOW,
};

function readContext(): ConnectorReadContext {
  return {
    connector: connectorRecord,
    collection: collection as VirtualCollectionRecord,
    request: {
      collectionId: String(collection._id),
      tenantId: String(TENANT),
      limit: 10,
    },
  };
}

describe("REST connector egress guard", () => {
  const connector = new RestOpenApiConnector();

  beforeEach(() => {
    resetConnectorCircuit(String(CONNECTOR_ID));
    safeFetchMock.mockReset();
    validateEgressUrlMock.mockReset();
    validateEgressUrlMock.mockImplementation(async (url: string) => new URL(url));
  });

  it("validates the URL before fetching and passes the response size/timeout caps", async () => {
    safeFetchMock.mockResolvedValue({
      success: true,
      status: 200,
      body: JSON.stringify([{ id: 1, title: "Hello" }]),
    });

    const result = await connector.executeRead(readContext());

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]._source.connectorId).toBe(String(CONNECTOR_ID));
    expect(validateEgressUrlMock).toHaveBeenCalledWith(
      "https://blog.example.com/wp-json/wp/v2/posts?per_page=10&page=1",
      { allowHttp: true, allowPrivate: true },
    );
    expect(safeFetchMock).toHaveBeenCalledWith(
      "https://blog.example.com/wp-json/wp/v2/posts?per_page=10&page=1",
      expect.objectContaining({
        method: "GET",
        timeoutMs: 15_000,
        maxSizeBytes: 5 * 1024 * 1024,
      }),
    );
    expect(validateEgressUrlMock.mock.invocationCallOrder[0]).toBeLessThan(
      safeFetchMock.mock.invocationCallOrder[0],
    );
  });

  it("does not fetch when the guard blocks the target (e.g. private-IP redirect/rebind)", async () => {
    validateEgressUrlMock.mockRejectedValue(new Error("Blocked private IP: 10.0.0.5"));

    await expect(connector.executeRead(readContext())).rejects.toThrow(/Blocked private IP/);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });

  it("reports the connector down when the health URL is blocked", async () => {
    validateEgressUrlMock.mockRejectedValue(new Error("Blocked private IP: 10.0.0.5"));

    const health = await connector.healthCheck(connectorRecord);

    expect(health.health).toBe("down");
    expect(health.message).toMatch(/Blocked private IP/);
    expect(safeFetchMock).not.toHaveBeenCalled();
  });
});
