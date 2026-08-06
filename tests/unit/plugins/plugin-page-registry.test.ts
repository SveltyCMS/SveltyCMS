/**
 * @file tests/unit/plugins/plugin-page-registry.test.ts
 * @description Unit tests for the plugin page registry (page resolution, nav, path normalization).
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  normalizePluginPath,
  pluginPageRegistry,
  type RegisteredPluginPage,
} from "../../../src/plugins/plugin-page-registry.svelte.ts";

const page = (id: string, path: string, nav?: any, caps: string[] = []): RegisteredPluginPage =>
  ({
    id,
    path,
    pluginId: "demo",
    component: () => Promise.resolve({ default: {} }),
    requiredCapabilities: caps,
    nav,
  }) as RegisteredPluginPage;

describe("normalizePluginPath", () => {
  it("lowercases, strips leading/trailing slashes, and collapses empties", () => {
    expect(normalizePluginPath("/Recaptcha/")).toBe("recaptcha");
    expect(normalizePluginPath("Analytics/Overview")).toBe("analytics/overview");
    expect(normalizePluginPath("///")).toBe("");
  });
});

describe("pluginPageRegistry", () => {
  beforeEach(() => pluginPageRegistry.clear());

  it("registers pages and resolves by path (case-insensitive)", () => {
    pluginPageRegistry.register("demo", page("demo:recaptcha", "/recaptcha"));
    pluginPageRegistry.register("demo", page("demo:analytics", "analytics/overview"));

    expect(pluginPageRegistry.getByPath("recaptcha")?.id).toBe("demo:recaptcha");
    expect(pluginPageRegistry.getByPath("/RECAPTCHA/")?.id).toBe("demo:recaptcha");
    expect(pluginPageRegistry.getByPath("analytics/overview")?.id).toBe("demo:analytics");
    expect(pluginPageRegistry.getByPath("missing")).toBeUndefined();
  });

  it("dedupes by page id (HMR / re-registration safety)", () => {
    pluginPageRegistry.register("demo", page("demo:recaptcha", "/recaptcha"));
    pluginPageRegistry.register("demo", page("demo:recaptcha", "/recaptcha/v2"));
    expect(pluginPageRegistry.getByPath("recaptcha/v2")?.id).toBe("demo:recaptcha");
    expect(pluginPageRegistry.getByPath("recaptcha")).toBeUndefined();
  });

  it("returns nav items sorted by group then order, with /plugin/ paths", () => {
    pluginPageRegistry.register(
      "demo",
      page("demo:beta", "beta", { group: "Analytics", label: "Beta", icon: "mdi:b", order: 10 }),
    );
    pluginPageRegistry.register(
      "demo",
      page("demo:alpha", "alpha", { group: "Analytics", label: "Alpha", icon: "mdi:a", order: 1 }),
    );
    pluginPageRegistry.register(
      "demo",
      page("demo:zeta", "zeta", { group: "System", label: "Zeta", icon: "mdi:z", order: 0 }),
    );
    pluginPageRegistry.register("demo", page("demo:hidden", "hidden")); // no nav

    const items = pluginPageRegistry.getNavItems();
    expect(items.map((i) => i.id)).toEqual(["demo:alpha", "demo:beta", "demo:zeta"]);
    expect(items[0]!.path).toBe("/plugin/alpha");
  });

  it("exposes requiredCapabilities on nav items", () => {
    pluginPageRegistry.register(
      "demo",
      page("demo:secure", "secure", { group: "G", label: "Secure", icon: "mdi:s" }, ["manage:x"]),
    );
    expect(pluginPageRegistry.getNavItems()[0]!.requiredCapabilities).toEqual(["manage:x"]);
  });
});
