/**
 * @file tests/unit/plugins/plugin-client-catalog.test.ts
 * @description Contract for the client-safe plugin catalog.
 *
 * `src/plugins/client.ts` is the browser entrypoint. It must statically include
 * every plugin directory whose `index.ts` declares `ui:` or `parts:` (those are
 * the plugins that can contribute entry-list columns, slots, pages, or admin
 * tools) and nothing else — no server-only dirs, no eager `import.meta.glob`.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { availablePlugins, registerPluginSlots } from "@src/plugins/client";
import { adminZoneRegistry } from "@src/plugins/admin-zone-registry.svelte.ts";
import { pluginPageRegistry } from "@src/plugins/plugin-page-registry.svelte.ts";
import { slotRegistry } from "@src/plugins/slot-registry.svelte.ts";

const PLUGINS_DIR = join(process.cwd(), "src/plugins");
/** Top-level `ui:` / `parts:` declaration in a plugin index module. */
const UI_DECLARATION = /(?:^|[\r\n])[ \t]*(?:ui|parts)\s*:/;
const METADATA_ID = /metadata\s*:\s*\{[\s\S]*?\bid\s*:\s*["']([^"']+)["']/;

interface UiPluginDir {
  dir: string;
  metadataId: string;
}

/** Discover UI-bearing plugin dirs from disk — no hardcoded plugin list. */
function discoverUiPluginDirs(): UiPluginDir[] {
  const found: UiPluginDir[] = [];

  for (const entry of readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const indexPath = join(PLUGINS_DIR, entry.name, "index.ts");
    if (!existsSync(indexPath)) continue;

    const source = readFileSync(indexPath, "utf8");
    if (!UI_DECLARATION.test(source)) continue;

    const match = METADATA_ID.exec(source);
    if (!match) throw new Error(`metadata.id missing in ${entry.name}/index.ts`);

    found.push({ dir: entry.name, metadataId: match[1] });
  }

  return found.sort((a, b) => a.dir.localeCompare(b.dir));
}

const uiPluginDirs = discoverUiPluginDirs();

describe("client plugin catalog", () => {
  it("discovers UI-bearing plugin directories from the filesystem", () => {
    expect(uiPluginDirs.length).toBeGreaterThan(0);
  });

  it("contains exactly the plugins whose index declares ui or parts", () => {
    const catalogIds = availablePlugins.map((plugin) => plugin.metadata.id).sort();

    // One catalog entry per plugin id (the old export scan could push duplicates).
    expect(new Set(catalogIds).size).toBe(catalogIds.length);

    // Same ids as the filesystem scan: no server-only plugin, no missing UI plugin.
    expect(catalogIds).toEqual(uiPluginDirs.map((entry) => entry.metadataId).sort());
  });

  it("only catalogs plugins that contribute UI", () => {
    for (const plugin of availablePlugins) {
      expect(plugin.ui ?? plugin.parts, plugin.metadata.id).toBeTruthy();
    }
  });

  it("never imports the server catalog or the eager glob", () => {
    const source = readFileSync(join(PLUGINS_DIR, "client.ts"), "utf8");

    expect(source).not.toMatch(/import\.meta\.glob\s*\(/);
    expect(source).not.toMatch(/(?:from|import)\s+["'](?:\.\/index|@src\/plugins\/index)["']/);
  });

  it("registers every catalog slot, page, and admin tool", () => {
    for (const plugin of availablePlugins) {
      const pluginId = plugin.metadata.id;

      for (const slot of plugin.ui?.slots ?? []) {
        const registered = slotRegistry.getSlots(slot.zone).find((entry) => entry.id === slot.id);
        expect(registered?.pluginId, `${pluginId} slot ${slot.id}`).toBe(pluginId);
      }

      for (const part of plugin.parts ?? []) {
        if (part.type === "page") {
          for (const page of part.pages) {
            expect(
              pluginPageRegistry.getById(page.id)?.pluginId,
              `${pluginId} page ${page.id}`,
            ).toBe(pluginId);
          }
        } else if (part.type === "adminTool") {
          for (const tool of part.tools) {
            const ids = adminZoneRegistry.getForZone(tool.zone).map((entry) => entry.id);
            expect(ids, `${pluginId} tool ${tool.id}`).toContain(`${pluginId}:${tool.id}`);
          }
        }
      }
    }
  });

  it("registerPluginSlots() is idempotent", () => {
    const zones = [
      ...new Set(
        availablePlugins.flatMap((plugin) => (plugin.ui?.slots ?? []).map((slot) => slot.zone)),
      ),
    ];
    const slotSnapshot = zones.map((zone) => slotRegistry.getSlots(zone).map((slot) => slot.id));
    const versions = {
      slots: slotRegistry.version,
      pages: pluginPageRegistry.version,
      adminZones: adminZoneRegistry.version,
    };

    registerPluginSlots();
    registerPluginSlots();

    expect(zones.map((zone) => slotRegistry.getSlots(zone).map((slot) => slot.id))).toEqual(
      slotSnapshot,
    );
    expect(slotRegistry.version).toBe(versions.slots);
    expect(pluginPageRegistry.version).toBe(versions.pages);
    expect(adminZoneRegistry.version).toBe(versions.adminZones);
  });
});
