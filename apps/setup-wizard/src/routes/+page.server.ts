/**
 * @file src/routes/+page.server.ts
 * @description Root page that redirects to the setup page
 */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Always redirect root to /setup
	// The hooks.server.ts will then handle whether to allow access or redirect elsewhere
	throw redirect(302, '/setup');
};
