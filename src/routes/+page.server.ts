/**
 * @file src/routes/+page.server.ts
 * @description
 * Server-side logic for the root route, redirecting to the default route if necessary.
 */

import { publicEnv } from '@root/config/public';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Collections
import { getCollections } from '@src/collections';

// System Logs
import logger from '@src/utils/logger';

export const load: PageServerLoad = async ({ locals }) => {
	try {
		logger.debug('Load function started in +page.server.ts');

		// User and permissions are now set by hooks.server.ts
		const user = locals.user;
		const permissions = locals.permissions;

		logger.debug(`User loaded: ${user ? 'Yes' : 'No'}`);
		logger.debug(`Permissions loaded: ${permissions && permissions.length > 0 ? 'Yes' : 'No'}`);

		// Declare collections variable
		let collections;

		// Fetch collections only if needed
		if (!locals.collections) {
			try {
				collections = await getCollections();
				locals.collections = collections;
			} catch (err) {
				logger.error('Error fetching collections:', err);
				throw redirect(302, '/error'); // Redirect to an error page or handle accordingly
			}
		} else {
			collections = locals.collections;
		}

		logger.debug(`Collections retrieved: ${collections ? Object.keys(collections).join(', ') : 'None'}`);

		if (collections && typeof collections === 'object' && Object.keys(collections).length > 0) {
			const firstCollectionKey = Object.keys(collections)[0];
			const firstCollection = collections[firstCollectionKey];

			const defaultLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
			const redirectUrl = `/${defaultLanguage}/${firstCollection.name}`;

			logger.info(`Redirecting to first collection: ${firstCollection.name} with URL: ${redirectUrl}`);
			throw redirect(302, redirectUrl);
		} else {
			logger.error('No collections found to redirect');
			throw redirect(302, '/setup'); // Redirect to a setup page or handle accordingly
		}
	} catch (err) {
		// Log the full error object
		logger.error(`Unexpected error in load function: +page.server:`, err);
		throw redirect(302, '/error'); // Redirect to an error page or handle accordingly
	}
};
