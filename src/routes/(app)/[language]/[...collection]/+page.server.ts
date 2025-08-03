/**
 * @file src/routes/(app)/[language]/[...collection]/+page.server.ts
 * @description Server-side loading for collection pages
 *
 * This module handles collection loading for specific collection pages.
 * Most authentication and user data is already handled by hooks.server.ts.
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
	// Destructure data already provided by hooks.server.ts
	const { user, theme, isAdmin, hasManageUsersPermission, roles: tenantRoles, tenantId } = locals;
	const { language, collection } = params;

	// Basic validation - most auth is handled by hooks.server.ts
	if (!user) {
		logger.warn('User not authenticated, redirecting to login.');
		throw redirect(302, '/login');
	}

	// Handle user system language preferences
	const userSystemLanguage = user?.systemLanguage;
	if (userSystemLanguage && userSystemLanguage !== language && publicEnv.AVAILABLE_CONTENT_LANGUAGES.includes(userSystemLanguage)) {
		const newPath = url.pathname.replace(`/${language}/`, `/${userSystemLanguage}/`);
		logger.debug(`Redirecting to user's preferred language: from /${language}/ to /${userSystemLanguage}/`);
		throw redirect(302, newPath);
	}

	// Validate language and collection parameters
	if (!language || !publicEnv.AVAILABLE_CONTENT_LANGUAGES.includes(language) || !collection) {
		const message = 'The language parameter is missing or invalid.';
		logger.warn(message, { language, collection });
		throw error(404, message);
	}

	// Handle token-based auth redirect
	if (user.lastAuthMethod === 'token') {
		logger.debug('User authenticated with token, redirecting to user page.');
		throw redirect(302, '/user');
	}

	logger.debug(`Collection page load started. Language: \x1b[34m${language}\x1b[0m`, { tenantId });

	// Initialize ContentManager and get collection data
	await contentManager.initialize(tenantId);
	const { collectionMap } = await contentManager.getCollectionData(tenantId);

	let currentCollection = null;
	let collectionIdentifier = collection;

	// Check if the collection parameter is a UUID
	const isUUID = /^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(collection);

	if (isUUID) {
		// Direct UUID lookup
		currentCollection = await contentManager.getCollection(collection, tenantId);
	} else {
		// Path-based lookup - find the UUID for this path
		const collectionPath = `/${collection}`;
		for (const [uuid, schemaData] of collectionMap.entries()) {
			if (schemaData.path === collectionPath) {
				currentCollection = await contentManager.getCollection(uuid, tenantId);
				collectionIdentifier = uuid;
				break;
			}
		}
	}

	// Return 404 if collection not found
	if (!currentCollection) {
		const message = `Collection not found: ${collection}`;
		logger.warn(message, { tenantId });
		throw error(404, message);
	}

	// Return simplified data - hooks.server.ts already provided most of what we need
	return {
		theme: theme || DEFAULT_THEME,
		contentLanguage: language,
		collection: {
			module: currentCollection?.module,
			name: currentCollection?.name,
			_id: currentCollection?._id || collectionIdentifier,
			path: currentCollection?.path,
			icon: currentCollection?.icon,
			label: currentCollection?.label,
			description: currentCollection?.description,
			status: currentCollection?.status, // Include the collection status
			fields:
				currentCollection?.fields?.map((field) => ({
					label: field.label,
					name: field.name,
					type: field.type,
					widget: field.widget ? { Name: field.widget.Name } : undefined,
					db_fieldName: field.db_fieldName,
					required: field.required,
					unique: field.unique,
					translated: field.translated
				})) || []
		},
		// User data already provided by hooks.server.ts
		user: {
			username: user.username,
			role: user.role,
			avatar: user.avatar
		},
		// These are already set by hooks.server.ts, just pass them through
		isAdmin,
		hasManageUsersPermission,
		roles: tenantRoles
	};
};
