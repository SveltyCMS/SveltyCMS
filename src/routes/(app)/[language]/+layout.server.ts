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
import type { LayoutServerLoad } from './$types';

// Theme
import { DEFAULT_THEME } from '@src/databases/themeManager';

// System Logger
import { logger } from '@utils/logger.svelte';

// Server-side load function for the layout
export const load: LayoutServerLoad = async ({ locals, params }) => {
	const { user, theme } = locals;
	const { language, collection } = params;

	logger.debug(`Layout server load started. Language: ${language}`);

	// ensure language exist :
	if (!language || !publicEnv.AVAILABLE_SYSTEM_LANGUAGES.includes(language) || !collection) {
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

	// Validate the requested language
	if (!publicEnv.AVAILABLE_CONTENT_LANGUAGES.includes(language)) {
		const message = `The language '${language}' is not available.`;
		logger.warn(message);
		throw error(404, message);
	}

	return {
		theme: theme || DEFAULT_THEME,
		language,
		user: {
			username: user.username,
			role: user.role,
			avatar: user.avatar
		}
	};
};
