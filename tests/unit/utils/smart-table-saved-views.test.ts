/**
 * @file tests/unit/utils/smart-table-saved-views.test.ts
 * @description Saved views CRUD (localStorage mocked via memory polyfill).
 */

import { beforeEach, describe, expect, it } from "vitest";

const store = new Map<string, string>();

const memoryStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => {
    store.set(k, v);
  },
  removeItem: (k: string) => {
    store.delete(k);
  },
  clear: () => store.clear(),
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
};

// Works under both Vitest and Bun (vi.stubGlobal is Vitest-only)
Object.defineProperty(globalThis, "localStorage", {
  value: memoryStorage,
  writable: true,
  configurable: true,
});

import {
  deleteSavedView,
  listSavedViews,
  renameSavedView,
  saveView,
} from "@utils/smart-table-saved-views";

describe("smart-table-saved-views", () => {
  beforeEach(() => {
    store.clear();
  });

  it("creates, lists, renames, and deletes views", () => {
    const v = saveView("col_posts", {
      name: "Published",
      filters: { status: { contains: "publish" } },
      sort: { sortedBy: "updatedAt", isSorted: -1 },
    });
    expect(v.id).toBeTruthy();
    expect(listSavedViews("col_posts")).toHaveLength(1);

    const renamed = renameSavedView("col_posts", v.id, "Live");
    expect(renamed?.name).toBe("Live");

    expect(deleteSavedView("col_posts", v.id)).toBe(true);
    expect(listSavedViews("col_posts")).toHaveLength(0);
  });
});
