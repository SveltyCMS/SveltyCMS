/**
 * @file src/routes/+page.server.ts
 * @description
 * Server-side logic for the root route, handling redirection to the first collection with the correct language.
 */

import { publicEnv } from '@root/config/public';
import { redirect, error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Collections
import { getCollections } from '@src/collections';
import type { Collections } from '@src/types';

// System Loggers
import { logger } from '@src/utils/logger';

export const load: PageServerLoad = async ({ locals, url }) => {
	try {
		logger.debug('Load function started in +page.server.ts');

		const user = locals.user;
		const permissions = locals.permissions;

		logger.debug(`User loaded: ${user ? 'Yes' : 'No'}`);
		logger.debug(`Permissions loaded: ${permissions && permissions.length > 0 ? 'Yes' : 'No'}`);

		if (!user) {
			logger.info('User not authenticated, redirecting to login');
			throw redirect(302, '/login');
		}

		// If we're already on a specific route (not the root), don't redirect
		if (url.pathname !== '/') {
			logger.debug(`Already on a specific route: ${url.pathname}, not redirecting`);
			return { user, permissions };
		}

		let collections: Collections;

		if (!locals.collections) {
			try {
				collections = await getCollections();
				if (!collections) {
					throw new Error('getCollections returned undefined');
				}
				locals.collections = collections;
			} catch (err) {
				const message = `Error in load.getCollections: ${err instanceof Error ? err.message : String(err)}`;
				logger.error(message);
				throw error(500, { message });
			}
		} else {
			collections = locals.collections as Collections;
		}

		logger.debug(`Collections retrieved: ${collections ? Object.keys(collections).join(', ') : 'None'}`);

		if (collections && Object.keys(collections).length > 0) {
			const firstCollectionKey = Object.keys(collections)[0];
			const firstCollection = collections[firstCollectionKey];

			if (!firstCollection || !firstCollection.name) {
				const message = 'First collection or its name is undefined';
				logger.error(message);
				throw error(500, { message });
			}

			const defaultLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
			const redirectUrl = `/${defaultLanguage}/${firstCollection.name}`;

			logger.info(`Redirecting to first collection: ${firstCollection.name} with URL: ${redirectUrl}`);
			throw redirect(302, redirectUrl);
		} else {
			const message = 'No collections found to redirect';
			logger.error(message);
			throw error(404, { message });
		}
	} catch (err) {
		if (err instanceof Error && 'status' in err) {
			// This is likely a redirect or an error we've already handled
			throw err;
		}
		const message = `Unexpected error in load function: ${err instanceof Error ? err.message : JSON.stringify(err)}`;
		logger.error(message);
		throw error(500, { message });
	}
};
