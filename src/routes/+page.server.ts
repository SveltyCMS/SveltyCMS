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

// System Logs
import logger from '@src/utils/logger';

export const load: PageServerLoad = async ({ locals }) => {
	logger.debug('Load function started in +page.server.ts');

	const user = locals.user;
	const permissions = locals.permissions;

	logger.debug(`User loaded: ${user ? 'Yes' : 'No'}`);
	logger.debug(`Permissions loaded: ${permissions && permissions.length > 0 ? 'Yes' : 'No'}`);

	if (!locals.user) {
		throw redirect(302, '/login');
	}

	let collections;

	if (!locals.collections) {
		try {
			collections = await getCollections();
			locals.collections = collections;
		} catch (err) {
			logger.error('Error fetching collections:', err);
			throw error(500, 'Error fetching collections');
		}
	} else {
		collections = locals.collections;
	}

	logger.debug(`Collections retrieved: ${collections ? Object.keys(collections).join(', ') : 'None'}`);

	if (collections && typeof collections === 'object' && Object.keys(collections).length > 0) {
		const firstCollectionKey = Object.keys(collections)[0];
		const firstCollection = collections[firstCollectionKey];

		if (!firstCollection || !firstCollection.name) {
			logger.error('First collection or its name is undefined');
			throw error(500, 'Invalid collection data');
		}

		const defaultLanguage = publicEnv.DEFAULT_CONTENT_LANGUAGE || 'en';
		const redirectUrl = `/${defaultLanguage}/${firstCollection.name}`;

		logger.info(`Redirecting to first collection: ${firstCollection.name} with URL: ${redirectUrl}`);
		throw redirect(302, redirectUrl);
	} else {
		logger.error('No collections found to redirect');
		throw error(404, 'No collections found');
	}
};
