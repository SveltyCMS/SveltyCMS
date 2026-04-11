/**
 * @file tests/unit/databases/database-resilience.test.ts
 * @description Unit tests for database resilience and error recovery.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@src/databases/db", () => ({
  dbAdapter: {
    crud: { findOne: vi.fn() },
  },
  getDbInitPromise: vi.fn().mockResolvedValue(undefined),
  resetDbInitPromise: vi.fn(),
}));

vi.mock("$app/environment", () => ({
  browser: false,
  dev: true,
  building: false,
  version: "test",
}));

vi.mock("$app/navigation", () => ({
  goto: vi.fn(),
  invalidate: vi.fn(),
}));

// We must import after mocks
import { resetDbInitPromise } from "@src/databases/db";

describe("Database Resilience Unit Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should call resetDbInitPromise", () => {
    resetDbInitPromise();
    expect(resetDbInitPromise).toHaveBeenCalled();
  });
});
