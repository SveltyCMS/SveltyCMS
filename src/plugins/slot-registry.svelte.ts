/**
 * @file src\plugins\slot-registry.svelte.ts
 * @description Registry for managing UI slots and injection zones
 *
 * Rune-based (`$state`) version counter so late slot registrations (e.g. the
 * plugin index bundled into a lazy route node, or onMount registrations) re-run
 * the Slot renderer's `$derived` — without it, slots registered after the first
 * render never appear (empty plugin workspaces, missing audit-history, ...).
 */

import { logger } from "@utils/logger";
import type { InjectionZone, PluginSlot } from "./types";

class SlotRegistry {
  private readonly slots: Map<InjectionZone, PluginSlot[]> = new Map();
  /** Bumped on every register so reactive consumers re-read the registry. */
  version = $state(0);

  /**
   * Register a new slot
   */
  register(slot: PluginSlot) {
    const existing = this.slots.get(slot.zone) || [];
    // Deduplicate: replace existing slot with same id (HMR / re-evaluation safety)
    const dupIndex = existing.findIndex((s) => s.id === slot.id);
    if (dupIndex !== -1) {
      existing[dupIndex] = slot;
      logger.debug(`[SlotRegistry] Replaced duplicate slot '${slot.id}' in zone '${slot.zone}'`);
    } else {
      existing.push(slot);
      logger.debug(`[SlotRegistry] Registered slot '${slot.id}' in zone '${slot.zone}'`);
    }
    // Sort by position (ascending), default to 0
    existing.sort((a, b) => (a.position || 0) - (b.position || 0));
    this.slots.set(slot.zone, existing);
    this.version += 1;
  }

  /**
   * Get all slots for a specific zone
   */
  getSlots(zone: InjectionZone): PluginSlot[] {
    return this.slots.get(zone) || [];
  }

  /**
   * Clear all slots (useful for HMR or testing)
   */
  clear() {
    this.slots.clear();
    this.version += 1;
  }
}

export const slotRegistry = new SlotRegistry();
