/**
 * @file tests/unit/routes/mediagallery-search-query.test.ts
 * @description URL contract for the media gallery's debounced server search and
 * the advanced-search filters pushed into the adapters.
 *
 * Features:
 * - writes the canonical `?q=` parameter
 * - removes the legacy `?search=` alias
 * - always resets `?page=` when the query or the filter set changes
 * - validates size / dimension / MIME params the same way the loader does
 */

import { describe, expect, it } from "vitest";
import {
  buildMediaAdvancedSearchUrl,
  buildMediaSearchUrl,
  clientSideCriteria,
  MEDIA_SEARCH_MAX_LENGTH,
  structuredFiltersFromCriteria,
} from "../../../src/routes/(app)/mediagallery/media-search-query";
import type { SearchCriteria } from "@utils/media/advanced-search";
import { readMediaStructuredFilters } from "@utils/media/media-query-filters";

describe("buildMediaSearchUrl", () => {
  it("writes q and drops a stale page offset", () => {
    const url = buildMediaSearchUrl(
      "http://localhost/mediagallery?folderId=f1&page=7&type=image",
      "logo",
    );

    expect(url.searchParams.get("q")).toBe("logo");
    expect(url.searchParams.get("page")).toBeNull();
    expect(url.searchParams.get("folderId")).toBe("f1");
    expect(url.searchParams.get("type")).toBe("image");
  });

  it("clears q, the legacy alias and the page offset", () => {
    const url = buildMediaSearchUrl(
      "http://localhost/mediagallery?q=old&search=legacy&page=3&sort=filename",
      "   ",
    );

    expect(url.searchParams.has("q")).toBe(false);
    expect(url.searchParams.has("search")).toBe(false);
    expect(url.searchParams.has("page")).toBe(false);
    expect(url.searchParams.get("sort")).toBe("filename");
  });

  it("normalises the legacy alias to q", () => {
    const url = buildMediaSearchUrl("http://localhost/mediagallery?search=legacy", "next");

    expect(url.searchParams.get("q")).toBe("next");
    expect(url.searchParams.has("search")).toBe(false);
  });

  it("caps the query at the loader's limit", () => {
    const url = buildMediaSearchUrl("http://localhost/mediagallery", "x".repeat(250));

    expect(url.searchParams.get("q")).toHaveLength(MEDIA_SEARCH_MAX_LENGTH);
  });
});

describe("readMediaStructuredFilters", () => {
  it("parses every supported param", () => {
    const filters = readMediaStructuredFilters(
      new URLSearchParams({
        mime: "image/png,image/jpeg",
        minSize: "1024",
        maxSize: "2048",
        minWidth: "800",
        maxWidth: "4000",
        minHeight: "600",
        maxHeight: "3000",
      }),
    );

    expect(filters).toEqual({
      mimeTypes: ["image/png", "image/jpeg"],
      minSize: 1024,
      maxSize: 2048,
      minWidth: 800,
      maxWidth: 4000,
      minHeight: 600,
      maxHeight: 3000,
    });
  });

  it("accepts repeated ?mime= params and folds case", () => {
    const filters = readMediaStructuredFilters(
      new URLSearchParams([
        ["mime", "IMAGE/PNG"],
        ["mime", "video/webm"],
      ]),
    );

    expect(filters.mimeTypes).toEqual(["image/png", "video/webm"]);
  });

  it("ignores invalid sizes, dimensions and MIME values", () => {
    const filters = readMediaStructuredFilters(
      new URLSearchParams({
        mime: "png, image/png, image/png; charset=utf-8",
        minSize: "abc",
        maxSize: "-5",
        minWidth: "0",
        maxWidth: "1.5",
        minHeight: "10px",
        maxHeight: "500000",
      }),
    );

    // Only the complete MIME token survives; every number is rejected
    // (`500000` px exceeds the cap, `10px` is not a number).
    expect(filters).toEqual({ mimeTypes: ["image/png"] });
  });

  it("drops an inverted range instead of pinning an empty result set", () => {
    const filters = readMediaStructuredFilters(
      new URLSearchParams({ minSize: "5000", maxSize: "10" }),
    );

    expect(filters.minSize).toBeUndefined();
    expect(filters.maxSize).toBeUndefined();
  });

  it("returns an empty object for an unfiltered URL", () => {
    expect(readMediaStructuredFilters(new URLSearchParams())).toEqual({});
  });
});

describe("buildMediaAdvancedSearchUrl", () => {
  it("writes the filters, syncs jsonPath and resets paging", () => {
    const url = buildMediaAdvancedSearchUrl(
      "http://localhost/mediagallery?folderId=f1&page=7&type=image&mime=image/gif",
      { mimeTypes: ["image/png"], minSize: 1024, minWidth: 1920 },
      { jsonPath: "metadata.camera = Canon" },
    );

    expect(url.searchParams.get("mime")).toBe("image/png");
    expect(url.searchParams.get("minSize")).toBe("1024");
    expect(url.searchParams.get("minWidth")).toBe("1920");
    expect(url.searchParams.get("jsonPath")).toBe("metadata.camera = Canon");
    // Stale offset is gone; unrelated params survive.
    expect(url.searchParams.has("page")).toBe(false);
    expect(url.searchParams.get("folderId")).toBe("f1");
    expect(url.searchParams.get("type")).toBe("image");
  });

  it("removes bounds the new search no longer carries", () => {
    const url = buildMediaAdvancedSearchUrl(
      "http://localhost/mediagallery?mime=image/png&maxSize=2048&maxHeight=1080",
      { minWidth: 100 },
    );

    expect(url.searchParams.has("mime")).toBe(false);
    expect(url.searchParams.has("maxSize")).toBe(false);
    expect(url.searchParams.has("maxHeight")).toBe(false);
    expect(url.searchParams.get("minWidth")).toBe("100");
  });

  it("leaves jsonPath untouched when the caller does not supply it", () => {
    const url = buildMediaAdvancedSearchUrl(
      "http://localhost/mediagallery?jsonPath=a%20%3D%20b",
      {},
    );

    expect(url.searchParams.get("jsonPath")).toBe("a = b");
  });

  it("clears jsonPath when given an empty string", () => {
    const url = buildMediaAdvancedSearchUrl(
      "http://localhost/mediagallery?jsonPath=a",
      {},
      {
        jsonPath: "   ",
      },
    );

    expect(url.searchParams.has("jsonPath")).toBe(false);
  });

  it("drops inverted and non-integer values through the shared validator", () => {
    const url = buildMediaAdvancedSearchUrl("http://localhost/mediagallery", {
      minWidth: 5000,
      maxWidth: 10,
      minSize: 0,
    });

    expect(url.searchParams.has("minWidth")).toBe(false);
    expect(url.searchParams.has("maxWidth")).toBe(false);
    expect(url.searchParams.has("minSize")).toBe(false);
  });
});

describe("advanced criteria split", () => {
  const criteria: SearchCriteria = {
    filename: "beach",
    fileTypes: ["image/png"],
    minSize: 1024,
    maxSize: 4096,
    minWidth: 800,
    maxWidth: 1920,
    minHeight: 600,
    maxHeight: 1080,
    tags: ["summer"],
    showDuplicatesOnly: true,
  };

  it("keeps only adapter-evaluable fields for the URL", () => {
    expect(structuredFiltersFromCriteria(criteria)).toEqual({
      mimeTypes: ["image/png"],
      minSize: 1024,
      maxSize: 4096,
      minWidth: 800,
      maxWidth: 1920,
      minHeight: 600,
      maxHeight: 1080,
    });
  });

  it("strips the pushed-down fields from the client fallback", () => {
    const residual = clientSideCriteria(criteria);

    expect(residual).toEqual({
      filename: "beach",
      tags: ["summer"],
      showDuplicatesOnly: true,
    });
    // The original criteria object is not mutated.
    expect(criteria.minWidth).toBe(800);
  });
});
