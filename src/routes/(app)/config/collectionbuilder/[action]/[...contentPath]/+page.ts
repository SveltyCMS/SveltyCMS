/**
 * @file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/+page.ts
 * @description Client-side logic for Collection Builder configuration pages.
 *
 * Features:
 * - Loads data prepared by the corresponding +page.server.ts file.
 * - Passes server-loaded data to the client for rendering.
 */

import type { PageLoad } from './$types';

export const load: PageLoad = ({ data }) => {
	return data;
};
