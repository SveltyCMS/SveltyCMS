/**
 * @file tests/unit/plugins/define-plugin.test.ts
 * @description Unit tests for the definePlugin identity function and all 8 PluginPart types.
 *
 * Features tested:
 * - definePlugin identity (returns plugin unchanged)
 * - Parts array preservation
 * - All 8 discriminated union part types
 * - PluginRoute requiredCapabilities variants ("public", [], [string])
 */

import { describe, it, expect } from "vitest";
import { definePlugin } from "@src/plugins/define-plugin";
import type { PluginPart } from "@src/plugins/define-plugin";

describe("definePlugin", () => {
  it("should return the plugin object unchanged (identity)", () => {
    const plugin = definePlugin({
      metadata: {
        id: "test-plugin",
        name: "Test Plugin",
        version: "1.0.0",
        description: "A test plugin",
        enabled: false,
      },
    });
    expect(plugin.metadata.id).toBe("test-plugin");
    expect(plugin.metadata.name).toBe("Test Plugin");
    expect(plugin.metadata.version).toBe("1.0.0");
  });

  it("should preserve parts array", () => {
    const plugin = definePlugin({
      metadata: { id: "p", name: "P", version: "1.0.0", description: "desc", enabled: false },
      parts: [{ type: "capability", capabilities: ["db:read"] }],
    });
    expect(plugin.parts).toHaveLength(1);
    expect(plugin.parts![0].type).toBe("capability");
  });

  it("should accept a plugin with all 8 part types", () => {
    // Use `as PluginPart[]` to allow simplified test fixtures for build/sugar
    // signatures while still exercising the discriminated union structurally.
    const parts = [
      {
        type: "schema",
        collections: [{ name: "plugin_test_test_coll", label: "Test", fields: [] }],
      },
      {
        type: "schemaTransform",
        transforms: [
          { type: "custom", sugarKeys: [], build: (_field: Record<string, unknown>) => ({}) },
        ],
      },
      {
        type: "route",
        routes: [
          {
            path: "/api/test",
            handler: async () => new Response("ok"),
            requiredCapabilities: [] as string[],
          },
        ],
      },
      { type: "capability", capabilities: ["db:read"] },
      {
        type: "settings",
        declaration: { fields: [{ type: "string", name: "key", label: "Key" }] },
      },
      {
        type: "adminTool",
        tools: [
          {
            id: "t1",
            label: "Tool",
            icon: "mdi:tool",
            component: async () => ({}),
            zone: "sidebar" as const,
          },
        ],
      },
      {
        type: "fieldComponent",
        components: [{ type: "map", component: async () => ({}), label: "Map" }],
      },
      {
        type: "documentAction",
        actions: [{ id: "a1", label: "Action", handler: async () => {} }],
      },
    ] as PluginPart[];

    const plugin = definePlugin({
      metadata: {
        id: "full",
        name: "Full Plugin",
        version: "2.0.0",
        description: "All parts",
        enabled: false,
      },
      parts,
    });

    expect(plugin.parts).toHaveLength(8);
  });

  it("should accept PluginRoute with 'public' requiredCapabilities", () => {
    const plugin = definePlugin({
      metadata: {
        id: "webhook",
        name: "Webhook",
        version: "1.0.0",
        description: "desc",
        enabled: false,
      },
      parts: [
        {
          type: "route",
          routes: [
            {
              path: "/api/webhook",
              handler: async () => new Response("ok"),
              requiredCapabilities: "public",
            },
          ],
        },
      ],
    });
    const route = (plugin.parts![0] as Extract<PluginPart, { type: "route" }>).routes[0];
    expect(route.requiredCapabilities).toBe("public");
  });

  it("should accept PluginRoute with empty array (auth-only)", () => {
    const plugin = definePlugin({
      metadata: {
        id: "auth",
        name: "Auth Only",
        version: "1.0.0",
        description: "desc",
        enabled: false,
      },
      parts: [
        {
          type: "route",
          routes: [
            {
              path: "/api/me",
              handler: async () => new Response("ok"),
              requiredCapabilities: [],
            },
          ],
        },
      ],
    });
    const route = (plugin.parts![0] as Extract<PluginPart, { type: "route" }>).routes[0];
    expect(route.requiredCapabilities).toEqual([]);
  });

  it("should accept PluginRoute with specific capability array", () => {
    const plugin = definePlugin({
      metadata: {
        id: "admin-route",
        name: "Admin Route",
        version: "1.0.0",
        description: "desc",
        enabled: false,
      },
      parts: [
        {
          type: "route",
          routes: [
            {
              path: "/api/admin/stats",
              handler: async () => new Response("ok"),
              requiredCapabilities: ["manage:settings"],
            },
          ],
        },
      ],
    });
    const route = (plugin.parts![0] as Extract<PluginPart, { type: "route" }>).routes[0];
    expect(route.requiredCapabilities).toEqual(["manage:settings"]);
  });
});
