/**
 * @file src/plugins/admin-zone-registry.svelte.ts
 * @description Renderer registry for the dormant admin-chrome extension systems.
 *
 * Merges two declared-but-unrendered contribution systems into one reactive
 * per-zone registry consumed by `<AdminZone>`:
 *
 * - `AdminTool` parts (`define-plugin`, zones: sidebar | toolbar | dashboard | config)
 * - `AdminAreaExtension` (`admin-area.ts`, zones: sidebar | header | footer |
 *   content-header | content-footer)
 *
 * Components are lazy-loaded, ordered by `order`, and gated behind optional
 * conditions. Capability gating is enforced by the server on the routes these
 * zones back (defense-in-depth); the client applies `requiredCapabilities` only
 * when a capability check helper is provided via `setCapabilityChecker`.
 *
 * Rune-based (`$state`) version counter so late registrations re-run the
 * renderer derivations (same pattern as `slot-registry.svelte.ts`).
 */

import { logger } from "@utils/logger";
import type { AdminAreaExtension, AdminAreaZone } from "./admin-area";
import type { AdminTool } from "./define-plugin";

/** Union of all renderable admin zones. */
export type AdminZoneName = AdminAreaZone | "toolbar" | "dashboard" | "config";

/** A lazy admin-zone entry (normalized from either contribution system). */
export interface AdminZoneEntry {
  id: string;
  zone: AdminZoneName;
  /** Lazy component loader — may resolve to `{ default: Component }` or a component. */
  component: () => Promise<any>;
  /** Lower renders first. */
  order: number;
  requiredCapabilities?: string[];
  /** Optional predicate over the zone context. */
  condition?: (context: Record<string, unknown>) => boolean;
  props?: Record<string, unknown>;
}

/** Optional client-side capability check (admin fast-path when unset). */
type CapabilityChecker = (required: string[]) => boolean;
let capabilityChecker: CapabilityChecker | null = null;

/** Inject a client capability checker (used by the admin layout). */
export function setAdminZoneCapabilityChecker(checker: CapabilityChecker | null): void {
  capabilityChecker = checker;
}

function canView(entry: AdminZoneEntry): boolean {
  if (!entry.requiredCapabilities || entry.requiredCapabilities.length === 0) return true;
  return capabilityChecker ? capabilityChecker(entry.requiredCapabilities) : true;
}

class AdminZoneRegistry {
  /** Bumped on every register so reactive consumers re-read the registry. */
  version = $state(0);

  private readonly zones = new Map<AdminZoneName, AdminZoneEntry[]>();

  private push(entry: AdminZoneEntry): void {
    const existing = this.zones.get(entry.zone) || [];
    const dupIndex = existing.findIndex((e) => e.id === entry.id);
    if (dupIndex !== -1) {
      existing[dupIndex] = entry;
      logger.debug(`[AdminZone] Replaced duplicate entry '${entry.id}' in zone '${entry.zone}'`);
    } else {
      existing.push(entry);
      logger.debug(`[AdminZone] Registered '${entry.id}' in zone '${entry.zone}'`);
    }
    existing.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    this.zones.set(entry.zone, existing);
    this.version += 1;
  }

  /** Register a `define-plugin` `adminTool` part. */
  registerTool(pluginId: string, tool: AdminTool): void {
    this.push({
      id: `${pluginId}:${tool.id}`,
      zone: tool.zone,
      component: tool.component,
      order: tool.order ?? 0,
      requiredCapabilities: tool.requiredCapabilities ?? ["admin"],
      props: { label: tool.label, icon: tool.icon },
    });
  }

  /** Register an `AdminAreaExtension` (admin shell chrome). */
  registerArea(ext: AdminAreaExtension): void {
    this.push({
      id: ext.id,
      zone: ext.zone,
      component: ext.component,
      order: ext.order ?? 0,
      requiredCapabilities: ext.requiredCapabilities,
      condition: ext.condition
        ? (ctx) => ext.condition!(ctx as unknown as Parameters<typeof ext.condition>[0])
        : undefined,
      props: ext.props,
    });
  }

  /** All entries for a zone, sorted by order — filtered by capability checker. */
  getForZone(zone: AdminZoneName): AdminZoneEntry[] {
    return (this.zones.get(zone) || []).filter(canView);
  }

  clear(): void {
    this.zones.clear();
    this.version += 1;
  }
}

export const adminZoneRegistry = new AdminZoneRegistry();

/**
 * Register an admin shell chrome extension (`AdminAreaExtension`).
 * Convenience wrapper so plugins can register shell zones directly.
 */
export function registerAdminAreaExtension(ext: AdminAreaExtension): void {
  adminZoneRegistry.registerArea(ext);
}
