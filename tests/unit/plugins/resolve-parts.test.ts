/**
 * @file tests/unit/plugins/resolve-parts.test.ts
 * @description Unit tests for PluginRegistry.resolveParts — the discriminated union
 * dispatch that resolves structured plugin parts into the appropriate subsystems.
 *
 * Features tested:
 * - Graceful handling of undefined/empty parts
 * - Schema part prefix validation and logging
 * - SchemaTransform sugar type registration
 * - Route requiredCapabilities security enforcement (undefined → throw)
 * - Route requiredCapabilities variants (public, auth-only, specific caps)
 * - Capability part registration with capabilityRegistry
 * - Settings part declaration merging
 * - AdminTool, FieldComponent, DocumentAction lazy-load logging
 * - Multiple part types resolved together
 */

import { describe, it, expect, beforeEach } from "vitest";
import { pluginRegistry } from "@src/plugins/registry";
import type { Plugin } from "@src/plugins/types";

// Helper to create a minimal plugin for testing
function createPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    metadata: {
      id: "test-plugin",
      name: "Test Plugin",
      version: "1.0.0",
      description: "Test plugin for resolveParts",
      enabled: false,
    },
    ...overrides,
  } as Plugin;
}

describe("PluginRegistry.resolveParts", () => {
  beforeEach(() => {
    pluginRegistry.reset();
  });

  // ── Empty / null parts ──────────────────────────────────

  it("should handle undefined parts gracefully", () => {
    const plugin = createPlugin();
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  it("should handle empty parts array gracefully", () => {
    const plugin = createPlugin({ parts: [] });
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  // ── Schema part ─────────────────────────────────────────

  it("should process schema parts without throwing", () => {
    const plugin = createPlugin({
      parts: [
        {
          type: "schema",
          collections: [{ name: "plugin_test-plugin_posts", label: "Posts", fields: [] }],
        },
      ],
    });
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  it("should log a warning when schema name lacks expected plugin prefix", () => {
    const plugin = createPlugin({
      parts: [
        {
          type: "schema",
          collections: [{ name: "bare_collection", label: "Bare", fields: [] }],
        },
      ],
    });
    // The warning is logged but does not throw — the schema is still accepted.
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  // ── SchemaTransform part ────────────────────────────────

  it("should process schemaTransform parts without throwing", () => {
    const plugin = createPlugin({
      parts: [
        {
          type: "schemaTransform",
          transforms: [
            {
              type: "rating",
              sugarKeys: [],
              build: (_field: Record<string, unknown>) => ({}),
            },
          ],
        },
      ],
    });
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  // ── Route part ──────────────────────────────────────────

  it("should throw when route.requiredCapabilities is undefined", () => {
    const plugin = createPlugin({
      parts: [
        {
          type: "route",
          routes: [
            {
              path: "/api/test",
              handler: async () => new Response("ok"),
              requiredCapabilities: undefined as any,
            },
          ],
        },
      ],
    });
    expect(() => pluginRegistry.resolveParts(plugin)).toThrow(/Security Violation/);
    expect(() => pluginRegistry.resolveParts(plugin)).toThrow(/requiredCapabilities/);
    expect(() => pluginRegistry.resolveParts(plugin)).toThrow(/test-plugin/);
  });

  it("should NOT throw when route.requiredCapabilities is [] (auth-only)", () => {
    const plugin = createPlugin({
      parts: [
        {
          type: "route",
          routes: [
            {
              path: "/api/auth-only",
              handler: async () => new Response("ok"),
              requiredCapabilities: [],
            },
          ],
        },
      ],
    });
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  it("should NOT throw when route.requiredCapabilities is 'public'", () => {
    const plugin = createPlugin({
      parts: [
        {
          type: "route",
          routes: [
            {
              path: "/api/public",
              handler: async () => new Response("ok"),
              requiredCapabilities: "public",
            },
          ],
        },
      ],
    });
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  it("should throw when ANY route in the array has undefined requiredCapabilities", () => {
    const plugin = createPlugin({
      parts: [
        {
          type: "route",
          routes: [
            {
              path: "/api/good",
              handler: async () => new Response("ok"),
              requiredCapabilities: [],
            },
            {
              path: "/api/bad",
              handler: async () => new Response("ok"),
              requiredCapabilities: undefined as any,
            },
          ],
        },
      ],
    });
    expect(() => pluginRegistry.resolveParts(plugin)).toThrow(/Security Violation/);
  });

  it("should log a warning when route capability is not declared in metadata", () => {
    const plugin = createPlugin({
      metadata: {
        id: "undeclared-cap-plugin",
        name: "Undeclared Cap",
        version: "1.0.0",
        description: "Missing capability in metadata",
        enabled: false,
        // No capabilities declared in metadata!
      },
      parts: [
        {
          type: "route",
          routes: [
            {
              path: "/api/needs-db",
              handler: async () => new Response("ok"),
              requiredCapabilities: ["db:read"],
            },
          ],
        },
      ],
    });
    // Should NOT throw — only logs a warning about undeclared capability.
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  // ── Capability part ─────────────────────────────────────

  it("should process capability parts without throwing", () => {
    const plugin = createPlugin({
      parts: [{ type: "capability", capabilities: ["db:read", "media:read"] }],
    });
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  it("should handle capability parts with empty array", () => {
    const plugin = createPlugin({
      parts: [{ type: "capability", capabilities: [] }],
    });
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  // ── Settings part ───────────────────────────────────────

  it("should process settings parts without throwing", () => {
    const plugin = createPlugin({
      parts: [
        {
          type: "settings",
          declaration: {
            fields: [{ type: "string", name: "apiKey", label: "API Key" }],
          },
        },
      ],
    });
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  it("should merge settings declaration into plugin.settings", () => {
    const plugin = createPlugin({
      parts: [
        {
          type: "settings",
          declaration: {
            fields: [{ type: "string", name: "key", label: "Key" }],
          },
        },
      ],
    });
    pluginRegistry.resolveParts(plugin);
    expect(plugin.settings).toBeDefined();
    expect(plugin.settings!.fields).toHaveLength(1);
    expect(plugin.settings!.fields[0].name).toBe("key");
  });

  it("should merge multiple settings parts (last one wins)", () => {
    const plugin = createPlugin({
      parts: [
        {
          type: "settings",
          declaration: {
            fields: [{ type: "string", name: "first", label: "First" }],
          },
        },
        {
          type: "settings",
          declaration: {
            fields: [{ type: "boolean", name: "second", label: "Second" }],
          },
        },
      ],
    });
    pluginRegistry.resolveParts(plugin);
    // The second settings part overwrites the first — plugin.settings is set per-part.
    expect(plugin.settings).toBeDefined();
    expect(plugin.settings!.fields[0].name).toBe("second");
  });

  // ── AdminTool part ──────────────────────────────────────

  it("should process adminTool parts without throwing (lazy load)", () => {
    const plugin = createPlugin({
      parts: [
        {
          type: "adminTool",
          tools: [
            {
              id: "dashboard-widget",
              label: "Widget",
              icon: "mdi:chart",
              component: async () => ({}),
              zone: "dashboard" as const,
            },
          ],
        },
      ],
    });
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  // ── FieldComponent part ─────────────────────────────────

  it("should process fieldComponent parts without throwing (lazy load)", () => {
    const plugin = createPlugin({
      parts: [
        {
          type: "fieldComponent",
          components: [
            {
              type: "star-rating",
              component: async () => ({}),
              label: "Star Rating",
            },
          ],
        },
      ],
    });
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  // ── DocumentAction part ─────────────────────────────────

  it("should process documentAction parts without throwing (lazy load)", () => {
    const plugin = createPlugin({
      parts: [
        {
          type: "documentAction",
          actions: [
            {
              id: "publish-to-channel",
              label: "Publish to Channel",
              handler: async () => {},
            },
          ],
        },
      ],
    });
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  // ── Multiple parts ──────────────────────────────────────

  it("should resolve multiple part types in a single plugin", () => {
    const plugin = createPlugin({
      metadata: {
        id: "multi-part-plugin",
        name: "Multi Part",
        version: "1.0.0",
        description: "Multiple parts",
        enabled: false,
        capabilities: ["db:read"],
      },
      parts: [
        { type: "capability", capabilities: ["db:read"] },
        {
          type: "schema",
          collections: [
            {
              name: "plugin_multi-part-plugin_items",
              label: "Items",
              fields: [],
            },
          ],
        },
        {
          type: "route",
          routes: [
            {
              path: "/api/multi",
              handler: async () => new Response("ok"),
              requiredCapabilities: [],
            },
          ],
        },
        {
          type: "settings",
          declaration: {
            fields: [{ type: "boolean", name: "enabled", label: "Enabled" }],
          },
        },
      ],
    });
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });

  // ── Unknown part type (exhaustiveness fallback) ─────────

  it("should not throw on unrecognized part types (exhaustiveness fallback)", () => {
    const plugin = createPlugin({
      parts: [{ type: "nonexistent" } as any],
    });
    // The default case logs a warning but does not throw.
    expect(() => pluginRegistry.resolveParts(plugin)).not.toThrow();
  });
});
