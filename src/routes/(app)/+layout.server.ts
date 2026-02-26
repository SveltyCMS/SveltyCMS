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

import { contentManager } from '@src/content/content-manager';
import type { User } from '@src/databases/auth/types';
import { auth } from '@src/databases/db';
import { DEFAULT_THEME } from '@src/databases/theme-manager';
import { publicEnv } from '@src/stores/global-settings.svelte';
import { error } from '@sveltejs/kit';
import { logger } from '@utils/logger.server';
import { getPrivateSetting } from '@src/services/settings-service';
import type { LayoutServerLoad } from './$types';

interface LayoutError {
	code?: string;
	details?: string;
	message: string;
}

async function refreshUser(sessionUser: User | null): Promise<User | null> {
	if (!sessionUser) {
		return null;
	}

	try {
		const dbUser = await auth?.getUserById(sessionUser._id.toString());

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
		// Start initialization but don't await generic content loading for the main thread
		// This prevents the "blank white page" issue
		const contentPromise = contentManager.initialize().then(() => {
			return Promise.all([contentManager.getNavigationStructure(), contentManager.getFirstCollection()]);
		});

		// User data is critical for shell, but we try to use session data if fast
		// refreshUser is reasonably fast, so we can await it or stream it too
		const freshUser = await refreshUser(sessionUser);

		// Get total user count for smart UI logic (like hiding chat for single users)
		const totalUsersResult = await auth?.getUserCount();
		const totalUsers = typeof totalUsersResult === 'number' ? totalUsersResult : 1;

		// Check if AI features are enabled for solo user assistant
		const aiModelChat = await getPrivateSetting('AI_MODEL_CHAT');
		const aiEnabled = !!(publicEnv.USE_AI_TAGGING || (aiModelChat && aiModelChat !== ''));

		return {
			theme: theme || DEFAULT_THEME,
			// Streamed data (Promises)
			contentStructure: contentPromise.then(([structure]) => structure),
			user: freshUser,
			totalUsers,
			aiEnabled,
			publicSettings: publicEnv, // Use the reactive store
			cspNonce,
			streamed: {}, // SvelteKit streaming marker
			firstCollection: contentPromise.then(([_, first]) => (first ? JSON.parse(JSON.stringify(first)) : null))
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
