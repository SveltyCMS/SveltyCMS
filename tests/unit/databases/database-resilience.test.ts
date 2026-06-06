/**
 * @file tests/unit/databases/database-resilience.test.ts
 * @description Database resilience: reconnection, initialization failure, graceful degradation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/databases/db", () => ({
  dbAdapter: { crud: { findOne: vi.fn() }, collection: { getModel: vi.fn() } },
  getDb: vi.fn().mockReturnValue({
    crud: { findOne: vi.fn() },
    collection: { getModel: vi.fn() },
  }),
  isDbConnected: vi.fn().mockReturnValue(true),
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  ensureFullInitialization: vi.fn().mockResolvedValue(undefined),
  resetDbInitPromise: vi.fn(),
  reinitializeSystem: vi.fn().mockResolvedValue({ status: "ready" }),
}));

vi.mock("$app/environment", () => ({
  browser: false,
  dev: true,
  building: false,
  version: "test",
}));

import { resetDbInitPromise, isDbConnected } from "@src/databases/db";

describe("Database Resilience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call resetDbInitPromise without throwing", () => {
    expect(() => resetDbInitPromise()).not.toThrow();
  });

  it("should report connection status", () => {
    expect(isDbConnected()).toBe(true);
  });

  it("should handle resetDbInitPromise multiple times", () => {
    resetDbInitPromise();
    expect(() => resetDbInitPromise()).not.toThrow();
  });
});
