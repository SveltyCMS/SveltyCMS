/**
 * @file tests/unit/plugins/unified-data-hub/tier-limits.test.ts
 * @description Community tier limit enforcement for connectors and virtual collections.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import { FederationError } from "@plugins/unified-data-hub/types";
import type { DatabaseId } from "@src/content/types";
import {
  assertCanAddConnector,
  assertCanAddVirtualCollection,
  getTierLimitStatus,
} from "@plugins/unified-data-hub/server/tier-limits";

const mockLicense = vi.fn();

vi.mock("@src/utils/license-manager", () => ({
  checkExtensionLicense: (...args: unknown[]) => mockLicense(...args),
}));

function mockDb(connectorCount: number, collectionCount: number) {
  return {
    crud: {
      findMany: vi.fn(async (col: string) => {
        if (col.includes("connectors")) {
          return {
            success: true,
            data: Array.from({ length: connectorCount }, (_, i) => ({ _id: `c${i}` })),
          };
        }
        return {
          success: true,
          data: Array.from({ length: collectionCount }, (_, i) => ({ _id: `v${i}` })),
        };
      }),
      findOne: vi.fn(async () => ({ success: true, data: null })),
    },
  } as any;
}

describe("Unified Data Hub tier limits", () => {
  beforeEach(() => {
    mockLicense.mockReset();
  });

  it("reports community caps when no license", async () => {
    mockLicense.mockResolvedValue({ active: true, hasLicense: false, daysRemaining: 14 });
    const status = await getTierLimitStatus(mockDb(0, 0), "default" as DatabaseId);
    expect(status.tier).toBe("community");
    expect(status.maxConnectors).toBe(1);
    expect(status.maxVirtualCollections).toBe(3);
  });

  it("reports pro tier without caps when licensed", async () => {
    mockLicense.mockResolvedValue({ active: true, hasLicense: true, daysRemaining: null });
    const status = await getTierLimitStatus(mockDb(5, 10), "default" as DatabaseId);
    expect(status.tier).toBe("pro");
    expect(status.maxConnectors).toBeNull();
    expect(status.maxVirtualCollections).toBeNull();
  });

  it("blocks second connector on community tier", async () => {
    mockLicense.mockResolvedValue({ active: true, hasLicense: false, daysRemaining: 14 });
    const db = mockDb(1, 0);
    await expect(assertCanAddConnector(db, "default" as DatabaseId)).rejects.toThrow(
      FederationError,
    );
    await expect(assertCanAddConnector(db, "default" as DatabaseId)).rejects.toMatchObject({
      code: "LICENSE_TIER_LIMIT",
    });
  });

  it("allows connector update when _id exists", async () => {
    mockLicense.mockResolvedValue({ active: true, hasLicense: false, daysRemaining: 14 });
    const db = mockDb(1, 0);
    db.crud.findOne = vi.fn(async () => ({ success: true, data: { _id: "existing" } }));
    await expect(
      assertCanAddConnector(db, "default" as DatabaseId, "existing"),
    ).resolves.toBeUndefined();
  });

  it("blocks fourth virtual collection on community tier", async () => {
    mockLicense.mockResolvedValue({ active: true, hasLicense: false, daysRemaining: 14 });
    const db = mockDb(0, 3);
    await expect(assertCanAddVirtualCollection(db, "default" as DatabaseId)).rejects.toMatchObject({
      code: "LICENSE_TIER_LIMIT",
    });
  });
});
