/**
 * @file tests/unit/plugins/editable-website/preview-dashboards.test.ts
 * @description Ensures the Live Preview plugin does not leak unexpected dashboard
 * pages and the WebMCP preview tool resolves the schema rules the CMS uses.
 */
import { describe, expect, it } from "vitest";
import { editableWebsitePlugin } from "@src/plugins/editable-website";
import { findPreviewSchema, hasPreviewConfig } from "@src/plugins/webmcp/tools/preview";

describe("editable-website pages", () => {
  it("does not register any marketing or overview dashboard pages in parts", () => {
    expect("parts" in editableWebsitePlugin).toBe(false);
  });
});

describe("get_live_preview_url schema resolution", () => {
  const collections = {
    success: true,
    data: [
      { _id: "pages", name: "pages", livePreview: "/{slug}" },
      { _id: "posts", name: "Posts", livePreview: true },
      { _id: "authors", name: "authors" },
    ],
  };

  it("resolves by id and by name through the API envelope", () => {
    expect(findPreviewSchema(collections, "pages")).toMatchObject({ livePreview: "/{slug}" });
    expect(findPreviewSchema(collections, "Posts")).toMatchObject({ livePreview: true });
  });

  it("returns undefined for unknown collections and non-array payloads", () => {
    expect(findPreviewSchema(collections, "missing")).toBeUndefined();
    expect(findPreviewSchema(null, "pages")).toBeUndefined();
    expect(findPreviewSchema({ data: {} }, "pages")).toBeUndefined();
  });

  it("accepts boolean and pattern configuration, rejects blank and absent", () => {
    expect(hasPreviewConfig({ livePreview: true })).toBe(true);
    expect(hasPreviewConfig({ livePreview: "/blog/{slug}" })).toBe(true);
    expect(hasPreviewConfig({ livePreview: "" })).toBe(false);
    expect(hasPreviewConfig({ livePreview: false })).toBe(false);
    expect(hasPreviewConfig({})).toBe(false);
    expect(hasPreviewConfig(undefined)).toBe(false);
  });
});
