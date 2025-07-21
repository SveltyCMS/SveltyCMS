/**
 * @file src/routes/(app)/[language]/+layout.server.ts
 * @description
 * This module handles the server-side loading logic for a SvelteKit application,
 * specifically for routes that include a language parameter. It manages collection access,
 * language-specific routing, and utilizes the centralized theme. The module performs the following tasks:
 *
 * - Ensures that the requested language is available.
 * - Manages collection access based on user permissions.
 * - Uses authentication information set by hooks.server.ts.
 * - Utilizes the theme provided by event.locals.theme.
 *
 * The module utilizes various utilities and configurations for robust error handling
 * and logging, providing a secure and user-friendly experience.
 */

import { publicEnv } from '@root/config/public';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logger
import { logger } from '@utils/logger.svelte';
import { contentManager } from '@root/src/content/ContentManager';

// Server-side load function for the layout
export const load: PageServerLoad = async ({ locals, params, url }) => {
	const { user, theme } = locals;
	const { language, collection } = params;

	// User's preferred language from session
	const userSystemLanguage = user?.systemLanguage;

	// If the user has a preferred language and it differs from the language in the URL,
	// redirect to the same page with the preferred language.
	if (userSystemLanguage && userSystemLanguage !== language && publicEnv.AVAILABLE_CONTENT_LANGUAGES.includes(userSystemLanguage)) {
		const newPath = url.pathname.replace(`/${language}/`, `/${userSystemLanguage}/`);
		logger.debug(`Redirecting to user's preferred language: from /${language}/ to /${userSystemLanguage}/`);
		throw redirect(302, newPath);
	}

	logger.debug(`Layout server load started. Language: \x1b[34m${language}\x1b[0m`);

	// The content language should be taken from the URL parameter `language`
	const contentLanguage = language;

	// ensure language exist :
	if (!contentLanguage || !publicEnv.AVAILABLE_CONTENT_LANGUAGES.includes(contentLanguage) || !collection) {
		const message = 'The language parameter is missing.';
		logger.warn(message);
		throw error(404, message);
	}

	// Ensure the user is authenticated (this should already be handled by hooks.server.ts)
	if (!user) {
		logger.warn('User not authenticated, redirecting to login.');
		throw redirect(302, '/login');
	}

	// Redirect to user page if lastAuthMethod is token
	if (user.lastAuthMethod === 'token') {
		logger.debug('User authenticated with token, redirecting to user page.');
		throw redirect(302, '/user');
	}

	await contentManager.initialize();

	// Get collection data to access the mapping
	const { collectionMap } = await contentManager.getCollectionData();

	let currentCollection = null;
	let collectionIdentifier = collection;

	// Check if the collection parameter is a UUID (32 hex characters)
	const isUUID = /^[a-f0-9]{32}$/i.test(collection);

	if (isUUID) {
		// Direct UUID lookup
		currentCollection = await contentManager.getCollection(collection);
	} else {
		// Path-based lookup - need to find the UUID for this path
		const collectionPath = `/${collection}`;

		// Search through the collection map to find the collection by path
		for (const [uuid, schemaData] of collectionMap) {
			if (schemaData.path === collectionPath) {
				currentCollection = await contentManager.getCollection(uuid);
				collectionIdentifier = uuid; // Use UUID internally
				break;
			}
		}
	}

	// If no collection found, return 404
	if (!currentCollection) {
		const message = `Collection not found: ${collection}`;
		logger.warn(message);
		throw error(404, message);
	}

	return {
		theme: theme || DEFAULT_THEME,
		contentLanguage,
		collection: {
			module: currentCollection?.module,
			name: currentCollection?.name,
			_id: currentCollection?._id || collectionIdentifier,
			path: currentCollection?.path,
			icon: currentCollection?.icon,
			label: currentCollection?.label,
			description: currentCollection?.description
		},
		user: {
			username: user.username,
			role: user.role,
			avatar: user.avatar
		}
	};
};
