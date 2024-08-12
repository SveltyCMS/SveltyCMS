import { publicEnv } from '@root/config/public';
import { privateEnv } from '@root/config/private';
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Auth
import { auth, initializationPromise, dbAdapter } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Stores
import { systemLanguage } from '@stores/store';

// Collections
import { getCollections } from '@src/collections';

// System Logs
import logger from '@src/utils/logger';

// Theme
import { DEFAULT_THEME } from '@src/utils/utils';

export const load: PageServerLoad = async ({ url, cookies }) => {
	await initializationPromise; // Ensure initialization is complete

	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw redirect(302, '/login');
	}

	// Secure this page with session cookie
	const session_id = cookies.get(SESSION_COOKIE_NAME);

	if (!session_id) {
		logger.debug('No session ID found, redirecting to login');
		throw redirect(302, '/login');
	}

	// Validate the user's session
	try {
		await auth.validateSession({ session_id });
	} catch (e) {
		logger.error(`Session validation failed: ${(e as Error).message}`);
		throw redirect(302, '/login');
	}

	// Fetch the theme
	let theme;
	try {
		theme = await dbAdapter.getDefaultTheme();
		// Ensure theme is serializable
		theme = JSON.parse(JSON.stringify(theme));
		logger.info(`Theme loaded successfully: ${JSON.stringify(theme)}`);
	} catch (error) {
		logger.error(`Error fetching default theme: ${(error as Error).message}`);
		theme = DEFAULT_THEME;
	}

	// Set the system language if needed based on the theme
	if (theme.language) {
		systemLanguage.set(theme.language);
	}

	// Fetch collections and redirect to the first one
	const collections = await getCollections();
	const firstCollection = Object.keys(collections)[0];

	if (!firstCollection) {
		logger.error('No collections found');
		throw new Error('No collections found');
	}

	logger.debug(`First collection: ${firstCollection}`);
	throw redirect(302, `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${collections[firstCollection].name}`);
};
