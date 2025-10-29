/**
 * @file src/stores/globalSettings.svelte.ts
 * @description Global Settings Store for PUBLIC ONLY
 *
 * 🔒 SECURITY: This file only contains PUBLIC settings safe for client-side use.
 * Private settings (DB passwords, API keys, etc.) are NEVER exposed here.
 * They remain server-only in src/services/settingsService.ts
 *
 * ### Features
 * - Reactive PUBLIC settings using Svelte 5 $state/$derived runes
 * - Automatic UI updates when settings change
 * - Populated by root layout load function
 * - Type-safe access to public configuration
 */

import { browser } from '$app/environment';
import { publicConfigSchema } from '@src/databases/schemas';
import { type InferOutput } from 'valibot';

type PublicEnv = InferOutput<typeof publicConfigSchema> & { PKG_VERSION?: string };

/**
 * The reactive state for all public environment settings.
 * Initialized empty and populated by initPublicEnv() from layout load.
 */
const state = $state<PublicEnv>({} as PublicEnv);
let currentVersion = $state(0);
let isPollingStarted = false;

/**
 * Check if settings have been loaded on the client.
 * Returns a reactive value using $derived internally.
 */
export function isInitialized(): boolean {
	return Object.keys(state).length > 0;
}

/**
 * Fetches the latest public settings from the server.
 */
async function fetchPublicSettings() {
	try {
		const response = await fetch('/api/settings/public');
		if (response.ok) {
			const data = await response.json();
			Object.assign(state, data);
		}
	} catch (error) {
		console.error('Failed to fetch public settings:', error);
	}
}

/**
 * Starts polling for settings changes.
 */
function startPolling() {
	if (!browser || isPollingStarted) return;
	isPollingStarted = true;

	setInterval(async () => {
		try {
			const response = await fetch('/api/settings/public/version');
			if (response.ok) {
				const data = await response.json();
				if (currentVersion !== 0 && currentVersion < data.version) {
					await fetchPublicSettings();
				}
				currentVersion = data.version;
			}
		} catch (error) {
			console.error('Failed to poll for settings version:', error);
		}
	}, 5000); // Poll every 5 seconds
}

/**
 * Initializes or updates the client-side public environment store.
 * This should be called from a root layout's load function.
 * @param data The public settings loaded from the server.
 */
export function initPublicEnv(data: PublicEnv): void {
	Object.assign(state, data);
	startPolling();
}

/**
 * Type-safe getter for a specific public setting.
 */
export function getPublicSetting<K extends keyof PublicEnv>(key: K): PublicEnv[K] {
	return state[key];
}

/**
 * Get the reactive public environment for use across the app.
 * Access properties directly: publicEnv.SITE_NAME (no $ prefix needed)
 *
 * Note: This returns the state object directly, which is reactive in Svelte 5.
 */
export function getPublicEnv(): PublicEnv {
	return state;
}

/**
 * Direct export of reactive state as publicEnv for backward compatibility.
 * All properties are reactive and will automatically update components.
 */
export const publicEnv: PublicEnv = state;
