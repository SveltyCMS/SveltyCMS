/**
 * @file src/plugins/slotRegistry.ts
 * @description Registry for managing UI slots and injection zones
 */

import { logger } from '@utils/logger.server';
import type { PluginSlot, InjectionZone } from './types';

class SlotRegistry {
	private slots: Map<InjectionZone, PluginSlot[]> = new Map();

	/**
	 * Register a new slot
	 */
	register(slot: PluginSlot) {
		const existing = this.slots.get(slot.zone) || [];
		existing.push(slot);
		// Sort by position (ascending), default to 0
		existing.sort((a, b) => (a.position || 0) - (b.position || 0));
		this.slots.set(slot.zone, existing);
		logger.debug(`[SlotRegistry] Registered slot '${slot.id}' in zone '${slot.zone}'`);
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
	}
}

export const slotRegistry = new SlotRegistry();
