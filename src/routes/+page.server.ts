/**
 * @file src/routes/+page.server.ts
 * @description
 * Server-side logic for the root route, handling redirection to the first collection with the correct language.
 */

import { publicEnv } from '@root/config/public';
import { redirect, error, type HttpError } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Collection Manager
import { collectionManager } from '@src/collections/CollectionManager';

// System Logger
import { logger } from '@utils/logger.svelte';

export const load: PageServerLoad = async ({ locals, url }) => {
	logger.debug('Load function started in +page.server.ts');

	const user = locals.user;
	const permissions = locals.permissions;

	logger.debug(`User loaded: ${user ? 'Yes' : 'No'}`);
	logger.debug(`Permissions loaded: ${permissions && permissions.length > 0 ? 'Yes' : 'No'}`);

	if (!user) {
		logger.info('User not authenticated, redirecting to login');
		throw redirect(302, '/login');
	}
	const { collections } = collectionManager.getCollectionData();

	// If we're already on a specific route (not the root), don't redirect
	if (url.pathname !== '/') {
		logger.debug(`Already on a specific route: \x1b[34m${url.pathname}\x1b[0m, not redirecting`);
		return { user, permissions };
	}

	try {
		// Get collections directly from CollectionManager
		logger.debug(`Collections retrieved: \x1b[34m${collections ? collections.length : 'None'}\x1b[0m`);

		if (!collections || collections.length === 0) {
			const message = 'No collections found to redirect';
			logger.error(message);
			throw error(404, { message });
		}

		const firstCollection = collections[0];
		if (!firstCollection || !firstCollection.name) {
			const message = 'First collection or its name is undefined';
			logger.error(message);
			throw error(500, { message });
		}

		const defaultLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
		const redirectUrl = `/${defaultLanguage}/${firstCollection.name}`;

		logger.info(`Redirecting to first collection: \x1b[34m${firstCollection.name}\x1b[0m with URL: \x1b[34m${redirectUrl}\x1b[0m`);
		throw redirect(302, redirectUrl);
	} catch (err) {
		// If it's a redirect or an HTTP error, rethrow it
		if ((err as HttpError)?.status === 302 || (err as HttpError)?.status) {
			throw err;
		}

		// Otherwise, it's an unexpected error
		const message = `Error getting collections: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message);
		throw error(500, { message });
	}
};
