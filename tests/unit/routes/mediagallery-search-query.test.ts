/**
 * @file tests/unit/routes/mediagallery-search-query.test.ts
 * @description URL contract for the media gallery's debounced server search.
 *
 * Features:
 * - writes the canonical `?q=` parameter
 * - removes the legacy `?search=` alias
 * - always resets `?page=` when the query changes or clears
 */

import { describe, expect, it } from "vitest";
import {
  buildMediaSearchUrl,
  MEDIA_SEARCH_MAX_LENGTH,
} from "../../../src/routes/(app)/mediagallery/media-search-query";

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
