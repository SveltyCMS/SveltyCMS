/**
 * @file tests/unit/plugins/unified-data-hub/license-gate.test.ts
 * @description License gate integration for virtual federation reads.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { DatabaseId } from "@databases/db-interface";
import { executeVirtualRead } from "@plugins/unified-data-hub/server/virtual-query-engine";
import {
  buildWordPressVirtualCollection,
  getWordPressRestEndpoint,
} from "@plugins/unified-data-hub/server/shared-schema/wordpress-rest";

const licenseMock = vi.fn();

vi.mock("@src/utils/license-manager", () => ({
  checkExtensionLicense: (...args: unknown[]) => licenseMock(...args),
}));

vi.mock("@src/plugins/registry", () => ({
  pluginRegistry: {
    get: () => ({ metadata: { enabled: true } }),
    getPluginState: async () => ({ enabled: true }),
  },
}));

const TENANT = "default";
const CONNECTOR_ID = "conn-1" as DatabaseId;
const COLLECTION_ID = "vc-1" as DatabaseId;

function createMockDb() {
  const collection = {
    _id: COLLECTION_ID,
    tenantId: TENANT,
    ...buildWordPressVirtualCollection("posts", String(CONNECTOR_ID), TENANT),
    enabled: true,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:00.000Z",
  };
  collection.source.endpoint = getWordPressRestEndpoint("posts");

  const connector = {
    _id: CONNECTOR_ID,
    tenantId: TENANT,
    name: "REST",
    type: "rest" as const,
    enabled: true,
    config: { baseUrl: "https://blog.example.com" },
    allowedHosts: ["blog.example.com"],
    capabilities: {
      filterPushdown: false,
      sortPushdown: false,
      joinable: false as const,
      maxPageSize: 100,
      supportsTransactions: false,
      staleness: "real-time" as const,
      ttlSeconds: 0,
      writable: true,
    },
    health: "ok" as const,
    createdAt: "2026-07-08T00:00:00.000Z",
    updatedAt: "2026-07-08T00:00:00.000Z",
  };

  return {
    crud: {
      findOne: vi.fn(async (col: string, _query: any) => {
        if (col.includes("virtual_schemas")) {
          return { success: true, data: collection };
        }
        if (col.includes("connectors")) {
          return { success: true, data: connector };
        }
        return { success: true, data: null };
      }),
      findMany: vi.fn(async () => ({ success: true, data: [] })),
      insert: vi.fn(async () => ({ success: true })),
    },
  } as any;
}

describe("Unified Data Hub license gate", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    licenseMock.mockReset();
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      headers: { get: () => "100" },
      json: async () => [{ id: 1, title: "t", slug: "s", status: "publish" }],
    })) as typeof fetch;
  });

  it("allows read when trial is active", async () => {
    licenseMock.mockResolvedValue({ active: true, hasLicense: false, daysRemaining: 7 });
    const result = await executeVirtualRead(createMockDb(), "wp-articles", {
      tenantId: TENANT,
      user: { isAdmin: true },
    });
    expect(result.data.length).toBeGreaterThan(0);
  });

  it("blocks read when license expired and no trial", async () => {
    licenseMock.mockResolvedValue({ active: false, hasLicense: false, daysRemaining: 0 });
    await expect(
      executeVirtualRead(createMockDb(), "wp-articles", {
        tenantId: TENANT,
        user: { isAdmin: true },
      }),
    ).rejects.toMatchObject({ code: "LICENSE_REQUIRED" });
  });

  it("allows read with valid license key", async () => {
    licenseMock.mockResolvedValue({ active: true, hasLicense: true, daysRemaining: null });
    const result = await executeVirtualRead(createMockDb(), "wp-articles", {
      tenantId: TENANT,
      user: { isAdmin: true },
    });
    expect(result.meta.connectorId).toBe(CONNECTOR_ID);
  });
});
