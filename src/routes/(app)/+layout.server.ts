/**
 * @file src/routes/(app)/+layout.server.ts
 * @description Enterprise-grade server-side logic for the main application layout.
 *
 * ### Features
 * - Type-safe data fetching with proper error boundaries
 * - Performance-optimized with concurrent data loading
 * - Cache invalidation support via SvelteKit's depends()
 * - Structured error handling with environment-aware details
 * - Modular user refresh logic for reusability
 * - Full TypeScript coverage with no 'any' types
 * - Serialization-safe return types
 * - Conditional data streaming for non-critical resources
 *
 * ### Architecture Notes
 * - Uses Promise.all() for parallel data fetching
 * - Implements graceful degradation on user refresh failures
 * - Leverages SvelteKit's streaming for progressive enhancement
 * - Follows SOLID principles with separated concerns
 */

import { error } from '@sveltejs/kit';
import { contentManager } from '@src/content/ContentManager';
import { DEFAULT_THEME } from '@src/databases/themeManager';
import { loadSettingsCache } from '@src/services/settingsService';
import { auth } from '@src/databases/db';

import type { LayoutServerLoad } from './$types';
import type { User } from '@src/databases/auth/types';

// System Logger (ensure server-safe implementation)
import { logger } from '@utils/logger.server';

// Error type for structured error handling
interface LayoutError {
	message: string;
	details?: string;
	code?: string;
}

/**
 * Refreshes user data from database to ensure avatar and profile data are current
 *
 * @param sessionUser - User object from session/locals
 * @returns Fresh user data from database or fallback to session user
 *
 * ### Error Handling
 * - Logs warnings on fetch failures but doesn't throw
 * - Gracefully falls back to session data
 * - Returns null if no user provided
 */
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

		// User not found in DB, fall back to session
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

/**
 * Creates a structured error response
 *
 * @param err - Error object
 * @param fallbackMessage - User-friendly fallback message
 * @returns Structured error object
 */
function createLayoutError(err: unknown, fallbackMessage: string): LayoutError {
	const isDevelopment = process.env.NODE_ENV === 'development';

	return {
		message: fallbackMessage,
		details: isDevelopment && err instanceof Error ? err.message : undefined,
		code: 'LAYOUT_LOAD_ERROR'
	};
}

/**
 * Main server load function for application layout
 *
 * ### Performance Optimizations
 * - Concurrent loading of content structure and user data
 * - Settings loaded from server-side cache
 * - Cache invalidation via depends('app:content')
 *
 * ### Data Flow
 * 1. Extract theme, user, nonce from locals
 * 2. Register cache dependency
 * 3. Load settings from cache (synchronous)
 * 4. Initialize content manager
 * 5. Fetch content structure and user data in parallel
 * 6. Return serializable data to client
 *
 * ### Error Strategy
 * - Throws HTTP 500 with structured error on critical failures
 * - Includes dev-only error details
 * - Logs all errors for monitoring
 */
export const load: LayoutServerLoad = async ({ locals, depends }) => {
	const { theme, user: sessionUser, cspNonce } = locals;

	// Register cache dependency for manual invalidation
	// Call invalidate('app:content') to refresh this data
	depends('app:content');

	// Load settings from server-side cache (fast, synchronous)
	const { public: publicSettings } = await loadSettingsCache();

	try {
		// Initialize content manager (idempotent operation)
		await contentManager.initialize();

		// Fetch critical data concurrently for optimal performance
		const [contentStructure, freshUser, firstCollection] = await Promise.all([
			contentManager.getNavigationStructure(),
			refreshUser(sessionUser),
			contentManager.getFirstCollection()
		]);

		// Return type-safe, serializable data
		return {
			theme: theme || DEFAULT_THEME,
			contentStructure, // Navigation tree structure
			user: freshUser, // Fresh user data with avatar
			publicSettings, // Public configuration from cache
			cspNonce, // CSP nonce for inline scripts
			// Streaming slot for non-critical data
			streamed: {
				// Add progressive enhancement data here
				// Example: virtualFolders: fetchVirtualFolders()
			},
			firstCollection: firstCollection ? JSON.parse(JSON.stringify(firstCollection)) : null // Pass first collection for immediate store hydration
		};
	} catch (err) {
		// Log full error for monitoring/debugging
		logger.error('Failed to load layout data', {
			error: err instanceof Error ? err.message : String(err),
			stack: err instanceof Error ? err.stack : undefined,
			user: sessionUser?._id
		});

		// Throw structured error to client
		const layoutError = createLayoutError(err, 'Failed to load application data');
		throw error(500, layoutError);
	}
};
