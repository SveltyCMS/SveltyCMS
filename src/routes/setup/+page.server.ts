/**
 * @file src/routes/setup/+page.server.ts
 * @description Server-side load function for the setup page.
 * It now protects the route from being accessed after setup is complete.
 */

import { isSetupComplete } from '@utils/setupCheck';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// --- SECURITY ---
	// If setup is already complete, redirect the user away immediately.
	// This is the primary protection for this route.
	if (isSetupComplete()) {
		throw redirect(302, '/login');
	}

	// Pass theme data from server to client to prevent FOUC
	return {
		theme: locals.theme,
		darkMode: locals.darkMode
	};
};
