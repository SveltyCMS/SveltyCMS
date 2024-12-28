/**
 * @file src/routes/(app)/+layout.server.ts
 * @description
 * This file is the server-side logic for the all collection data
 */

import type { LayoutServerLoad } from './$types';

// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

import { contentManager } from '../../content/ContentManager';

// Server-side load function for the layout
export const load: LayoutServerLoad = async ({ locals }) => {
	const { theme } = locals;
	const { collections } = contentManager.getCollectionData();

	return {
		theme: theme || DEFAULT_THEME,
		collections
	};
};
