/**
 * @file src/routes/setup/+page.server.ts
 * @description Server-side load function for the setup page
 */

import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Pass theme data from server to client to prevent FOUC
	return {
		theme: locals.theme,
		darkMode: locals.darkMode
	};
};
