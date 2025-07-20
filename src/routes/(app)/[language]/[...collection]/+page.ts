/**
 * @file src/routes/(app)/[language]/[...collection]/+page.server.ts
 * @description
 * This module handles the server-side loading logic for a SvelteKit application,
 * specifically for routes that include a language parameter. It manages collection access,
 * language-specific routing, and utilizes the centralized theme. The module performs the following tasks:
 *
 * Features:
 * - Ensures that the requested language is available.
 * - Manages collection access based on user permissions.
 * - Uses authentication information set by hooks.server.ts.
 * - Utilizes the theme provided by event.locals.theme
 */

import { processModule } from '@root/src/content/utils';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ data }) => {
	const selectedCollection = await processModule(data.collection.module as string);

	if (!selectedCollection || !selectedCollection?.schema) return;

	const collectionData = Object.fromEntries(Object.entries(data.collection).filter(([key]) => key !== 'module'));

	const collection = {
		...selectedCollection?.schema,
		...collectionData
	};

	return {
		...data,
		collection
	};
};
