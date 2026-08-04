/**
 * @file tests/unit/plugins/admin-zone-registry.test.ts
 * @description Unit tests for the admin zone registry (AdminTool + AdminAreaExtension merge).
 */

import { describe, expect, it, beforeEach } from "vitest";
import {
  adminZoneRegistry,
  setAdminZoneCapabilityChecker,
  registerAdminAreaExtension,
} from "../../../src/plugins/admin-zone-registry.svelte.ts";
import type { AdminAreaExtension } from "../../../src/plugins/admin-area";

const tool = (id: string, zone: any, caps?: string[]) => ({
  id,
  label: id,
  icon: "mdi:test",
  component: () => Promise.resolve({ default: {} }),
  zone,
  requiredCapabilities: caps,
});

const area = (id: string, zone: any): AdminAreaExtension => ({
  id,
  zone,
  component: () => Promise.resolve({ default: {} }),
});

describe("adminZoneRegistry", () => {
  beforeEach(() => {
    adminZoneRegistry.clear();
    setAdminZoneCapabilityChecker(null);
  });

  it("registers AdminTool parts into their zones", () => {
    adminZoneRegistry.registerTool("demo", tool("status", "toolbar"));
    adminZoneRegistry.registerTool("demo", tool("widget", "dashboard"));

    expect(adminZoneRegistry.getForZone("toolbar").map((e) => e.id)).toEqual(["demo:status"]);
    expect(adminZoneRegistry.getForZone("dashboard").map((e) => e.id)).toEqual(["demo:widget"]);
    expect(adminZoneRegistry.getForZone("sidebar")).toEqual([]);
  });

  it("registers AdminAreaExtension into shell zones", () => {
    registerAdminAreaExtension(area("shell-header", "header"));
    registerAdminAreaExtension(area("shell-sidebar", "sidebar"));

    expect(adminZoneRegistry.getForZone("header").map((e) => e.id)).toEqual(["shell-header"]);
    expect(adminZoneRegistry.getForZone("sidebar").map((e) => e.id)).toEqual(["shell-sidebar"]);
  });

  it("sorts by order (lower first) with id tie-break", () => {
    adminZoneRegistry.registerTool("demo", { ...tool("b", "toolbar"), order: 0 });
    adminZoneRegistry.registerTool("demo", { ...tool("a", "toolbar"), order: 0 });
    adminZoneRegistry.registerTool("demo", { ...tool("c", "toolbar"), order: -1 });
    expect(adminZoneRegistry.getForZone("toolbar").map((e) => e.id)).toEqual([
      "demo:c",
      "demo:a",
      "demo:b",
    ]);
  });

  it("dedupes by entry id (HMR safety)", () => {
    adminZoneRegistry.registerTool("demo", tool("status", "toolbar"));
    adminZoneRegistry.registerTool("demo", tool("status", "toolbar"));
    expect(adminZoneRegistry.getForZone("toolbar")).toHaveLength(1);
  });

  it("gates entries behind the injected capability checker", () => {
    adminZoneRegistry.registerTool("demo", tool("admin-only", "sidebar", ["admin"]));
    adminZoneRegistry.registerTool("demo", tool("open", "sidebar", []));

    // No checker → visible (client default; server enforces 403)
    expect(adminZoneRegistry.getForZone("sidebar")).toHaveLength(2);

    setAdminZoneCapabilityChecker((required) => required.length === 0);
    expect(adminZoneRegistry.getForZone("sidebar").map((e) => e.id)).toEqual(["demo:open"]);
  });

  it("defaults missing requiredCapabilities on tools to admin", () => {
    adminZoneRegistry.registerTool("demo", tool("implicit", "sidebar"));
    setAdminZoneCapabilityChecker((required) => required.length === 0);
    expect(adminZoneRegistry.getForZone("sidebar")).toEqual([]);
  });
});
