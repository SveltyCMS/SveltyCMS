/**
 * @file src/lib/json-render/catalog.ts
 * @description Central catalog for AI-native generative layouts using json-render-svelte.
 */

import { schema, defineRegistry } from 'json-render-svelte';
import type { WidgetDefinition } from '@widgets/types';

// Import basic components
import VerticalLayout from './components/VerticalLayout.svelte';
import HorizontalLayout from './components/HorizontalLayout.svelte';
import Text from './components/Text.svelte';

// The unified catalog containing all AI-generatable components.
export const sveltyCatalog = schema.createCatalog({
	components: {},
	actions: {}
});

// The registry that maps component names to Svelte components.
const { registry } = defineRegistry(sveltyCatalog as any, {
	components: {
		VerticalLayout: VerticalLayout as any,
		HorizontalLayout: HorizontalLayout as any,
		Text: Text as any,
		Control: Text as any // Fallback Control to Text for now
	}
});

export const sveltyRegistry = registry as any;

/**
 * Registers a widget into the generative catalog.
 * Note: Dynamic registration for AI prompts will be expanded in Q2.
 */
export function registerForJsonRender(widget: WidgetDefinition) {
	if (!widget.jsonRender) return;

	// In Q2, we will implement dynamic catalog expansion.
	// For now, this preserves the widget's intent for generative layouts.
}
