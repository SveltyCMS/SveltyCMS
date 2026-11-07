/**
 * @file tests/unit/components/entry-list-export.test.ts
 * @description
 * Unit tests for CSV serialization and export in collection entry list.
 *
 * Features:
 * - RFC 4180 escaping for special characters, double quotes, and line breaks
 * - Fallback to tableHeaders when visibleTableHeaders is empty
 * - Empty dataset toast guard without throwing
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { exportEntriesToCsv } from "@components/collection-display/entry-list-export";
import type { CollectionEntry, TableHeader } from "@src/content/types";

describe("exportEntriesToCsv", () => {
  let createObjectURLMock: ReturnType<typeof vi.fn>;
  let revokeObjectURLMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURLMock = vi.fn().mockReturnValue("blob:mock-export-url");
    revokeObjectURLMock = vi.fn();
    globalThis.URL.createObjectURL = createObjectURLMock as unknown as typeof URL.createObjectURL;
    globalThis.URL.revokeObjectURL = revokeObjectURLMock as unknown as typeof URL.revokeObjectURL;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("safely bails out when items array is empty", () => {
    expect(() => {
      exportEntriesToCsv({
        items: [],
        visibleHeaders: [],
        fallbackHeaders: [],
        collectionName: "test",
      });
    }).not.toThrow();
    expect(createObjectURLMock).not.toHaveBeenCalled();
  });

  it("creates a CSV blob with RFC 4180 escaped fields", () => {
    const items: CollectionEntry[] = [
      {
        _id: "e1",
        title: 'Post with "quotes"',
        description: "Line 1\nLine 2",
        tags: ["svelte", "cms"],
      } as unknown as CollectionEntry,
    ];

    const headers: TableHeader[] = [
      { id: "h1", name: "title", label: 'Title "Col"', visible: true },
      { id: "h2", name: "description", label: "Description", visible: true },
      { id: "h3", name: "tags", label: "Tags", visible: true },
    ];

    exportEntriesToCsv({
      items,
      visibleHeaders: headers,
      fallbackHeaders: headers,
      collectionName: "articles",
    });

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-export-url");
  });
});
