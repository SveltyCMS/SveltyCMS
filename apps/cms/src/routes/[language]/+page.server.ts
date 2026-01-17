/**
 * @file apps/cms/src/routes/[language]/+page.server.ts
 * @description Redirect handler for language-only URLs
 * Redirects /en (or any language) to the first available collection
 *
 * ### Features
 * - Redirects /en (or any language) to the first available collection
 * - Updates collections to ensure they're loaded
 * - Gets all collections
 * - Gets the first collection with a valid path
 * - Redirects to the first collection
 * - Redirects to collectionbuilder if no collection with path found
 */

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { updateCollections, getCollections } from '@content';
import { logger } from '@shared/utils/logger.server';

export const load: PageServerLoad = async ({ params }) => {
	const { language } = params;

	try {
		// Update collections to ensure they're loaded
		await updateCollections();

		// Get all collections
		const collections = await getCollections();
		const collectionList = Object.values(collections).filter(Boolean);

		logger.info('[Language Redirect] Collections loaded', {
			language,
			collectionCount: collectionList.length,
			collectionNames: collectionList.map((c) => c?.name)
		});

		if (collectionList.length === 0) {
			logger.info('[Language Redirect] No collections found, redirecting to collectionbuilder');
			throw redirect(302, `/config/collectionbuilder`);
		}

		// Get the first collection with a valid path
		const firstCollection = collectionList.find((c) => c && c.path);

		if (firstCollection && firstCollection.path) {
			// Check if path already includes language
			const redirectPath = firstCollection.path.startsWith(`/${language}`) ? firstCollection.path : `/${language}${firstCollection.path}`;

			logger.info('[Language Redirect] Redirecting to first collection', {
				collectionName: firstCollection.name,
				collectionPath: firstCollection.path,
				redirectPath
			});

			throw redirect(302, redirectPath);
		}

		// Fallback to collectionbuilder if no collection with path found
		logger.warn('[Language Redirect] No collection with valid path found, redirecting to collectionbuilder');
		throw redirect(302, `/config/collectionbuilder`);
	} catch (error) {
		// If it's already a redirect, rethrow it
		if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 302) {
			throw error;
		}

		logger.error('Error in language redirect', { error });
		// Otherwise, fallback to collectionbuilder
		throw redirect(302, `/config/collectionbuilder`);
	}
};
