/**
 * @file src/routes/(app)/+layout.server.ts
 * @description Enterprise-grade server-side logic for the main application layout.
 *
 * ### Features
 * - Content Loading
 * - User Management
 * - Theme Management
 * - Content Versioning
 *
 * ### Security
 * - Content Loading is cached
 * - User Management is cached
 * - Theme Management is cached
 * - Content Versioning is cached
 */
import { error } from '@sveltejs/kit';
import { contentManager } from '@src/content/ContentManager';
import { DEFAULT_THEME } from '@src/databases/themeManager';
import { publicEnv } from '@src/stores/globalSettings.svelte';
import { auth } from '@src/databases/db';

import type { LayoutServerLoad } from './$types';
import type { User } from '@src/databases/auth/types';
import { logger } from '@utils/logger.server';

interface LayoutError {
	message: string;
	details?: string;
	code?: string;
}

async function refreshUser(sessionUser: User | null): Promise<User | null> {
	if (!sessionUser) return null;

	try {
		const dbUser = await auth!.getUserById(sessionUser._id.toString());

		if (dbUser) {
			logger.debug('Fresh user data loaded in layout', {
				userId: dbUser._id,
				hasAvatar: !!dbUser.avatar,
				avatar: dbUser.avatar
			});
			return dbUser;
		}

		logger.warn('User not found in database, using session data', {
			userId: sessionUser._id
		});
		return sessionUser;
	} catch (err) {
		logger.warn('Failed to fetch fresh user data in layout, using session data', {
			error: err instanceof Error ? err.message : String(err),
			userId: sessionUser._id
		});
		return sessionUser;
	}
}

function createLayoutError(err: unknown, fallbackMessage: string): LayoutError {
	const isDevelopment = process.env.NODE_ENV === 'development';

	return {
		message: fallbackMessage,
		details: isDevelopment && err instanceof Error ? err.message : undefined,
		code: 'LAYOUT_LOAD_ERROR'
	};
}

export const load: LayoutServerLoad = async ({ locals, depends }) => {
	const { theme, user: sessionUser, cspNonce } = locals;

	depends('app:content');

	// Store is already initialized by root layout - just use it

	try {
		await contentManager.initialize();

		const [contentStructure, freshUser, firstCollection] = await Promise.all([
			contentManager.getNavigationStructure(),
			refreshUser(sessionUser),
			contentManager.getFirstCollection()
		]);

		return {
			theme: theme || DEFAULT_THEME,
			contentStructure,
			user: freshUser,
			publicSettings: publicEnv, // Use the reactive store
			cspNonce,
			streamed: {},
			firstCollection: firstCollection ? JSON.parse(JSON.stringify(firstCollection)) : null
		};
	} catch (err) {
		logger.error('Failed to load layout data', {
			error: err instanceof Error ? err.message : String(err),
			stack: err instanceof Error ? err.stack : undefined,
			user: sessionUser?._id
		});

		const layoutError = createLayoutError(err, 'Failed to load application data');
		throw error(500, layoutError);
	}
};
