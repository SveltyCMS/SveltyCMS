/**
 * @file src/plugins/editable-website/index.ts
 * @description Editable Website Plugin Definition
 */

import type { Plugin } from '@src/plugins/types';
import { slotRegistry } from '@src/plugins/slotRegistry';

// Register the Live Preview slot
slotRegistry.register({
	id: 'live_preview',
	zone: 'entry_edit',
	component: () => import('./LivePreview.svelte'),
	props: {
		label: 'Live Preview',
		icon: 'mdi:eye-outline'
	}
	// Only show this slot if the collection has livePreview enabled?
	// The Slot component itself doesn't filter by collection config easily yet without custom logic in Fields.svelte
	// But we can check it inside the component or assume if the plugin is enabled, it shows.
	// However, standard SveltyCMS behavior was to only show if collection.livePreview is true.
	// For now, we register it. The component or the host (Fields.svelte) might need a way to filter.
	// Actually, looking at Fields.svelte, it iterates all slots.
	// We might need to add a "filter" or "enabled" logic to slots based on context.
	// For this phase, we'll register it and let it appear.
	// Best practice: The Host (Fields.svelte) provides the context (collection).
	// Ideally the slot registry could support a 'condition' function.
	// But let's stick to the plan: register it.
});

export const editableWebsitePlugin: Plugin = {
	metadata: {
		id: 'editable-website',
		name: 'Editable Website & Live Preview',
		version: '1.0.0',
		description: 'Provides real-time Live Preview with bidirectional communication (Handshake Protocol).',
		icon: 'mdi:web',
		enabled: true
	},
	ui: {
		editView: {
			tabs: [
				{
					id: 'live_preview',
					label: 'Live Preview',
					icon: 'mdi:eye-outline',
					component: () => import('./LivePreview.svelte')
				}
			]
		}
	}
};
