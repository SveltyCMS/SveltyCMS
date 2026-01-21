/**
 * @file src/routes/(app)/+layout.ts
 * @description Universal layout load (runs on both server and client)
 * Hydrates the client-side reactive store with public settings from the server
 */

import { initPublicEnv } from '@stores/globalSettings.svelte.ts';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = ({ data }) => {
	// Hydrate our client-side rune store with the data from the server.
	// This runs once on the server for SSR and once on the client for hydration.
	if (data.publicSettings) {
		initPublicEnv(data.publicSettings);
	}

	// Return the data for components to use
	return data;
};
