/**
 * @file src/plugins/webmcp/index.ts
 * @description WebMCP Plugin - Enables Client-Side AI Agents to interact with SveltyCMS
 */

import type { Plugin } from '@src/plugins/types';
// Note: @mcp-b/global polyfill is loaded in +layout.svelte

// Import Tools
import { registerContentTools } from './tools/content';
import { registerNavigationTools } from './tools/navigation';

export const webmcpPlugin: Plugin = {
	metadata: {
		id: 'webmcp',
		name: 'WebMCP (AI Agent Interface)',
		version: '1.0.0',
		description: 'Exposes SveltyCMS content and navigation to browser-based AI agents via standard Web Model Context Protocol.',
		icon: 'mdi:robot',
		enabled: true
	},

	// Client-side initialization logic
	// We use the 'ui' hooks to inject our tool registration logic since WebMCP is client-side
	ui: {
		actions: [
			{
				id: 'init-webmcp',
				label: 'Initialize WebMCP',
				handler: 'initWebMCP' // This is a marker, logic below handles actual init
			}
		]
	}
};

/**
 * Initialize WebMCP Tools
 * This should be called from +layout.svelte onMount
 */
export async function initWebMCP() {
	if (typeof window === 'undefined') {
		return;
	}

	console.log('[WebMCP] Initializing...');

	// Wait for polyfill to be active
	if (!window.navigator.modelContext) {
		console.warn('[WebMCP] navigator.modelContext not found. Ensure @mcp-b/global is loaded.');
		return;
	}

	try {
		registerContentTools();
		registerNavigationTools();
		console.log('[WebMCP] Tools registered successfully.');
	} catch (err) {
		console.error('[WebMCP] Failed to register tools:', err);
	}
}
