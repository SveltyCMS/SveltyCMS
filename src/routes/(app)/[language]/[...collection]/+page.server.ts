/**
 * @file src/routes/(app)/[language]/[...collection]/+page.server.ts
 * @description Server-side loading for collection pages
 *
 * This module handles collection loading for specific collection pages.
 * Most authentication and user data is already handled by hooks.server.ts.
 */

import { getPublicSettingSync } from '@src/services/settingsService';
import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logger
import { contentManager } from '@root/src/content/ContentManager';
import { logger } from '@utils/logger.svelte';

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
	const availableLanguages = getPublicSettingSync('AVAILABLE_CONTENT_LANGUAGES') || ['en'];
	if (userSystemLanguage && userSystemLanguage !== language && availableLanguages.includes(userSystemLanguage)) {
		const newPath = url.pathname.replace(`/${language}/`, `/${userSystemLanguage}/`);
		logger.trace(`Redirecting to user's preferred language: from /\x1b[34m${language}\x1b[0m/ to /${userSystemLanguage}/`);
		throw redirect(302, newPath);
	}

	// Validate language and collection parameters
	if (!language || !availableLanguages.includes(language) || !collection) {
		const message = 'The language parameter is missing or invalid.';
		logger.warn(message, { language, collection });
		throw error(404, message);
	}

	// Handle token-based auth redirect
	if (user.lastAuthMethod === 'token') {
		logger.trace('User authenticated with token, redirecting to user page.');
		throw redirect(302, '/user');
	}

	logger.trace(`Collection page load started. Language: \x1b[34m${language}\x1b[0m`, { tenantId });

	// getCollections() auto-initializes, no need for explicit initialize()
	const startTime = performance.now();
	const collections = await contentManager.getCollections(tenantId);
	const collectionLoadTime = performance.now() - startTime;
	logger.debug(`Collections loaded in \x1b[32m${collectionLoadTime.toFixed(2)}ms\x1b[0m (count: \x1b[33m${collections.length}\x1b[0m)`);

	// Build a map for easy lookup
	const collectionMap = new Map(collections.map((c) => [c._id!, c]));

	let currentCollection = null;
	let collectionIdentifier = collection;

	// Check if the collection parameter is a UUID (with or without dashes)
	// Matches: 69ccfaf4cc4b4f27a825a6b3c16c20b5 or 69ccfaf4-cc4b-4f27-a825-a6b3c16c20b5
	const isUUID = /^[a-f0-9]{32}$|^[a-f0-9]{8}-([a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(collection);

	if (isUUID) {
		// Direct UUID lookup from collections map
		const normalizedUUID = collection.replace(/-/g, ''); // Remove dashes if present
		currentCollection = collectionMap.get(normalizedUUID) || collectionMap.get(collection);
		logger.debug(`Collection lookup by UUID: ${collection} -> ${currentCollection ? 'found' : 'not found'}`);
	} else {
		// Path-based lookup - find the UUID for this path
		// The collection param is like "Collections/Names", add leading slash to match stored paths
		const collectionPath = `/${collection}`;
		logger.debug(`Looking up collection by path: \x1b[34m${collectionPath}\x1b[0m`);

		for (const [uuid, schemaData] of collectionMap.entries()) {
			logger.trace(`Comparing path: \x1b[34m${schemaData.path}\x1b[0m with \x1b[33m${collectionPath}\x1b[0m`);
			if (schemaData.path === collectionPath) {
				currentCollection = schemaData;
				collectionIdentifier = uuid;
				logger.debug(`Collection found by path: \x1b[34m${collectionPath}\x1b[0m -> UUID: \x1b[33m${uuid}\x1b[0m`);
				break;
			}
		}
	}

	// Return 404 if collection not found
	if (!currentCollection) {
		const message = `Collection not found: ${collection}`;
		logger.warn(message, { tenantId, availablePaths: Array.from(collectionMap.values()).map((c) => c.path) });
		throw error(404, message);
	}

	// Get site name from server-side settings
	const siteName = getPublicSettingSync('SITE_NAME') || 'SveltyCMS';

	// Return simplified data - hooks.server.ts already provided most of what we need
	return {
		theme: theme || DEFAULT_THEME,
		contentLanguage: language,
		siteName,
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
