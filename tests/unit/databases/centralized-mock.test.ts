/**
 * @file tests/unit/databases/centralized-mock.test.ts
 * @description Demonstrates the centralized mock registry pattern.
 *
 * Instead of ad-hoc `vi.mock()` calls that silently drift when the real API changes,
 * use the type-checked mock registry. If a method is renamed or removed, this file
 * FAILS TO COMPILE until the mock is updated — eliminating mock drift.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createMockDbAdapter } from "../mocks/registry";

describe("Centralized Mock Registry Pattern", () => {
  let db: ReturnType<typeof createMockDbAdapter>;

  beforeEach(() => {
    db = createMockDbAdapter();
  });

  it("should provide a complete mock dbAdapter with all required methods", () => {
    // Every method on the mock maps 1:1 to the real IDBAdapter interface.
    // If the real interface adds a method, this mock FAILS TO COMPILE.
    expect(db.crud.findOne).toBeDefined();
    expect(db.crud.insert).toBeDefined();
    expect(db.crud.findMany).toBeDefined();
    expect(db.auth.getUserById).toBeDefined();
    expect(db.auth.validateSession).toBeDefined();
    expect(db.collection.getModel).toBeDefined();
    expect(db.media.files.getByHash).toBeDefined();
    expect(db.system.preferences.get).toBeDefined();
  });

  it("should support overrides for specific test scenarios", () => {
    const custom = createMockDbAdapter({
      crud: {
        findOne: () => Promise.resolve({ success: true, data: { _id: "custom" } }),
      },
    });
    expect(custom.crud.findOne).toBeDefined();
    // Non-overridden methods still work
    expect(custom.auth.getUserById).toBeDefined();
  });
});
