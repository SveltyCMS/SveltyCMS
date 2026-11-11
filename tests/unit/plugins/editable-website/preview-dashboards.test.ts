/**
 * @file tests/unit/plugins/editable-website/preview-dashboards.test.ts
 * @description The two Live Preview dashboards must stay registered (nav + route)
 * and the WebMCP preview tool must resolve the same schema rules the CMS uses.
 */
import { afterEach, describe, expect, it } from "vitest";
import { editableWebsitePlugin } from "@src/plugins/editable-website";
import { findPreviewSchema, hasPreviewConfig } from "@src/plugins/webmcp/tools/preview";
import {
  normalizePluginPath,
  pluginPageRegistry,
} from "../../../../src/plugins/plugin-page-registry.svelte.ts";

const pagesPart = editableWebsitePlugin.parts?.find((part) => part.type === "page");
const pages = pagesPart?.type === "page" ? pagesPart.pages : [];

afterEach(() => {
  pluginPageRegistry.clear();
});

describe("editable-website dashboards", () => {
  it("contributes exactly the overview and competitive pages", () => {
    expect(pages.map((page) => page.id).sort()).toEqual([
      "editable-website:competitive",
      "editable-website:overview",
    ]);
  });

  it("declares capabilities, a nav entry and a component loader for each page", () => {
    for (const page of pages) {
      expect(Array.isArray(page.requiredCapabilities)).toBe(true);
      expect(page.nav).toBeDefined();
      expect(page.nav?.group).toBe("Editing");
      expect(typeof page.component).toBe("function");
      expect(page.path.startsWith("editable-website")).toBe(true);
    }
  });

  it("mounts both pages under /plugin and exposes them as nav items", () => {
    for (const page of pages) {
      pluginPageRegistry.register("editable-website", page);
    }

    expect(normalizePluginPath("editable-website")).toBe("editable-website");
    expect(pluginPageRegistry.getByPath("editable-website")?.id).toBe("editable-website:overview");
    expect(pluginPageRegistry.getByPath("/editable-website/competitive/")?.id).toBe(
      "editable-website:competitive",
    );

    const nav = pluginPageRegistry.getNavItems();
    expect(nav.map((item) => item.path)).toEqual([
      "/plugin/editable-website",
      "/plugin/editable-website/competitive",
    ]);
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
