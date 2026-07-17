/**
 * @file src/plugins/admin-area.ts
 * @description Typed extension system for the admin shell layout.
 *
 * The `AdminArea` type lets plugins declaratively extend the admin shell
 * (sidebar, header, footer, and content regions) with lazy-loaded Svelte
 * components, capability gating, and conditional rendering — distinct from
 * the existing `InjectionZone` slot system which targets content-editing
 * pages rather than the admin chrome itself.
 *
 * ### Relationship to InjectionZone / PluginSlot:
 * - `InjectionZone` / `PluginSlot` targets content pages (entry editor,
 *   dashboard, media gallery, config, etc.).
 * - `AdminAreaExtension` targets the admin **shell** (sidebar, header,
 *   footer, content-header/footer) — the persistent chrome surrounding
 *   every admin route.
 *
 * ### Features:
 * - declarative admin shell extension
 * - capability-gated visibility
 * - conditional rendering via `AdminAreaContext`
 * - priority ordering for deterministic layout
 */

import type { User } from "@auth/types";

// ============================================================================
// Admin Area Extension
// ============================================================================

/** Zones in the admin shell layout that plugins can extend. */
export type AdminAreaZone = "sidebar" | "header" | "footer" | "content-header" | "content-footer";

/** Runtime context available to admin area condition and component props. */
export interface AdminAreaContext {
  /** Currently authenticated user. */
  user: User | null;
  /** Active tenant identifier. */
  tenantId: string;
  /** Current admin pathname (e.g., "/admin/collections/pages"). */
  pathname: string;
  /** Current collection name when on a collection route, else undefined. */
  collection?: string;
  /** Whether the current user holds the admin role. */
  isAdmin: boolean;
}

/**
 * A plugin's contribution to an admin shell zone.
 *
 * Plugins that register an `AdminAreaExtension` get their component rendered
 * into the matching zone of the admin layout. Components are lazy-loaded and
 * gated behind optional capabilities and conditions.
 */
export interface AdminAreaExtension {
  /** Unique identifier for this extension (e.g., "my-plugin-sidebar-widget"). */
  id: string;
  /** Which admin shell zone to render into. */
  zone: AdminAreaZone;
  /** Lazy-loaded Svelte component. */
  component: () => Promise<unknown>;
  /**
   * Priority order within the zone. Lower numbers render first.
   * @default 0
   */
  order?: number;
  /**
   * Optional predicate — when it returns `false`, the component is not
   * rendered. Runs on mount and whenever `AdminAreaContext` changes.
   */
  condition?: (context: AdminAreaContext) => boolean;
  /**
   * Capabilities required to see this area. When omitted, the extension
   * is visible to all authenticated users.
   */
  requiredCapabilities?: string[];
  /** Static props forwarded to the component. */
  props?: Record<string, unknown>;
}

// ============================================================================
// Registry Type (consumer-facing)
// ============================================================================

/**
 * Read-only view of the admin area registry.
 *
 * The admin layout reads from this to discover which extensions to render
 * in each shell zone. Plugins register via the mutable `AdminAreaRegistry`.
 */
export interface AdminAreaRegistrySnapshot {
  /** Get all extensions for a given zone, sorted by order. */
  getForZone(zone: AdminAreaZone): AdminAreaExtension[];
  /** Get a specific extension by id. */
  getById(id: string): AdminAreaExtension | undefined;
}
