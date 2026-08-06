/**
 * @file src/plugins/plugin-page-registry.svelte.ts
 * @description Registry of plugin-contributed admin pages and their nav items.
 *
 * Plugins declare `{ type: "page" }` parts via `definePlugin`. Pages are
 * mounted under `/plugin/<path>` by the catch-all route
 * `src/routes/(app)/plugin/[...path]/` — the server load resolves the page by
 * path, enforces `requiredCapabilities` (403), runs the page's `load` hook,
 * and the client resolves the lazy component by page id.
 *
 * Rune-based (`$state`) version counter so late registrations (plugin index in
 * lazy route nodes, HMR) re-run the sidebar nav and page renderer derivations.
 */

import type { PluginPageDefinition } from "./define-plugin";

/** A registered page with its owning plugin id attached. */
export interface RegisteredPluginPage extends PluginPageDefinition {
  pluginId: string;
}

/** Declarative sidebar nav item derived from a page's `nav` field. */
export interface PluginNavItem {
  /** Page id (unique). */
  id: string;
  /** Full admin path, e.g. `/plugin/recaptcha`. */
  path: string;
  /** Group label (e.g. "Analytics"). */
  group: string;
  /** Link label. */
  label: string;
  /** Iconify icon id. */
  icon: string;
  /** Order within the group. */
  order: number;
  /** Capabilities required to view the page (`[]` = any authenticated admin). */
  requiredCapabilities: string[];
}

/** Normalize a plugin page path: lowercase, no leading/trailing slashes. */
export function normalizePluginPath(path: string): string {
  return path
    .replace(/^\/+|\/+$/g, "")
    .split("/")
    .map((seg) => seg.toLowerCase())
    .filter(Boolean)
    .join("/");
}

class PluginPageRegistry {
  /** Bumped on every register so reactive consumers re-read the registry. */
  version = $state(0);

  private readonly pages = new Map<string, RegisteredPluginPage>(); // id → page
  private readonly byPath = new Map<string, string>(); // normalized path → id

  register(pluginId: string, page: PluginPageDefinition): void {
    // Re-registration (HMR / part re-evaluation): drop the previous path mapping
    // for this id so stale paths stop resolving.
    const existing = this.pages.get(page.id);
    if (existing) {
      this.byPath.delete(normalizePluginPath(existing.path));
    }
    const normalized = normalizePluginPath(page.path);
    this.pages.set(page.id, { ...page, pluginId });
    this.byPath.set(normalized, page.id);
    this.version += 1;
  }

  /** Resolve a page by its route path (after `/plugin/`), or undefined. */
  getByPath(path: string): RegisteredPluginPage | undefined {
    const id = this.byPath.get(normalizePluginPath(path));
    return id ? this.pages.get(id) : undefined;
  }

  /** Resolve a page by id (client uses this to lazy-load the component). */
  getById(id: string): RegisteredPluginPage | undefined {
    return this.pages.get(id);
  }

  /** All declarative nav items, sorted by group then order. */
  getNavItems(): PluginNavItem[] {
    const items: PluginNavItem[] = [];
    for (const page of this.pages.values()) {
      if (!page.nav) continue;
      items.push({
        id: page.id,
        path: `/plugin/${normalizePluginPath(page.path)}`,
        group: page.nav.group,
        label: page.nav.label,
        icon: page.nav.icon,
        order: page.nav.order ?? 0,
        requiredCapabilities: page.requiredCapabilities,
      });
    }
    return items.sort(
      (a, b) =>
        a.group.localeCompare(b.group) || a.order - b.order || a.label.localeCompare(b.label),
    );
  }

  clear(): void {
    this.pages.clear();
    this.byPath.clear();
    this.version += 1;
  }
}

export const pluginPageRegistry = new PluginPageRegistry();
