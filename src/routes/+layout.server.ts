/**
 * @file src/routes/+layout.server.ts
 * @description Server-side layout logic for the entire application
 */

import { getGlobalSetting } from '@src/stores/globalSettings';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Get site name from database settings
	const siteName = getGlobalSetting('SITE_NAME') || 'SveltyCMS';
	
	return {
		user: null,
		permissions: [],
		settings: {
			SITE_NAME: siteName
		}
	};
};
