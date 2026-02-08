/**
 * @file src/utils/demoCleanup.ts
 * @description Utility to clean up expired demo tenants in DEMO mode.
 *
 * This function identifies tenants that were created over 60 minutes ago
 * and removes all associated data from the database to reset the demo environment.
 * It is intended to be run periodically (e.g., every 5 minutes).
 *
 * Uses the database adapter pattern (getDb()) so it works with both
 * MongoDB and MariaDB/Drizzle backends.
 */

import { logger } from '@utils/logger.server';
import { getDb, getPrivateEnv } from '@src/databases/db';
import type { User } from '@src/databases/auth/types';
import type { DatabaseId } from '@src/databases/dbInterface';

/**
 * Cleans up expired demo tenants.
 * Runs only if DEMO mode is enabled (via env var or private config).
 */
export async function cleanupExpiredDemoTenants() {
	const env = getPrivateEnv();
	// Check ONLY private config (static) or env var - enforced security
	const isDemo = process.env.SVELTYCMS_DEMO === 'true' || env?.DEMO === true;

	// Safety check: ONLY run in demo mode
	if (!isDemo) return;

	const db = getDb();
	if (!db) {
		logger.warn('[Demo Cleanup] Database adapter not initialized, skipping');
		return;
	}

	// Cleanup TTL: 60 minutes (3x the 20-minute session/cookie TTL as a grace period)
	const EXPIRATION_MS = 60 * 60 * 1000;
	const cutoffDate = new Date(Date.now() - EXPIRATION_MS);

	try {
		// 1. Identify expired tenants
		// Get all users, then filter client-side for tenanted admin users past the cutoff.
		// MariaDB's mapQuery() only supports equality operators, so date filtering
		// must happen in JS. Demo mode has limited users so this is acceptable.
		const usersResult = await db.auth.getAllUsers();
		if (!usersResult.success || !usersResult.data) {
			logger.warn('[Demo Cleanup] Failed to fetch users');
			return;
		}

		// Filter for expired tenant admin users
		// Both adapters store createdAt (MongoDB via timestamps:true, MariaDB via schema).
		// The User type doesn't formally declare createdAt, but it exists on returned objects.
		const expiredTenantUsers = usersResult.data.filter((u: User & { createdAt?: string }) => {
			if (!u.tenantId || u.role !== 'admin') return false;
			const createdAt = u.createdAt ? new Date(u.createdAt) : null;
			return createdAt && createdAt < cutoffDate;
		});

		const tenantIds = [...new Set(expiredTenantUsers.map((u) => u.tenantId).filter(Boolean))] as string[];

		if (tenantIds.length === 0) return;

		logger.info(`[Demo Cleanup] Found ${tenantIds.length} expired tenants. Starting cleanup...`);

		// Import fs and path for physical file deletion
		const fs = await import('fs/promises');
		const path = await import('path');

		// Collect all tenant user IDs for session/user cleanup
		const allTenantUsers = usersResult.data.filter((u) => u.tenantId && tenantIds.includes(u.tenantId));

		for (const tenantId of tenantIds) {
			logger.debug(`[Demo Cleanup] Deleting tenant: ${tenantId}`);
			const tenantUserIds = allTenantUsers.filter((u) => u.tenantId === tenantId).map((u) => u._id);

			// 2. Delete Physical Files & Media Records
			try {
				await db.media.setupMediaModels();
				// Get media files via the adapter's paginated method, then filter by tenantId.
				// PaginatedResult has .items (not .data).
				const mediaResult = await db.media.files.getByFolder(undefined, { page: 1, pageSize: 10000 });
				if (mediaResult.success && mediaResult.data) {
					const tenantMedia = mediaResult.data.items.filter((m) => (m as unknown as { tenantId?: string }).tenantId === tenantId);

					if (tenantMedia.length > 0) {
						logger.debug(`[Demo Cleanup] Deleting ${tenantMedia.length} files for tenant ${tenantId}`);

						// Delete physical files
						for (const media of tenantMedia) {
							if (media.originalFilename) {
								try {
									const filePath = path.resolve(media.originalFilename);
									await fs.unlink(filePath);
								} catch (err) {
									if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
										logger.warn(`[Demo Cleanup] Failed to delete file ${media.originalFilename}:`, err);
									}
								}
							}
						}

						// Delete media records via adapter
						const mediaIds = tenantMedia.map((m) => m._id);
						await db.media.files.deleteMany(mediaIds);
					}
				}
			} catch (err) {
				logger.error(`[Demo Cleanup] Error cleaning up media for tenant ${tenantId}:`, err);
			}

			// 3. Delete Content Data (content_nodes, content_drafts, content_revisions)
			// Both adapters handle these names correctly:
			// - MongoDB normalizes to collection_content_* (where content data lives)
			// - MariaDB resolves via getTable() to the correct schema tables
			try {
				await db.crud.deleteMany('content_nodes', { tenantId } as any);
				await db.crud.deleteMany('content_drafts', { tenantId } as any);
				await db.crud.deleteMany('content_revisions', { tenantId } as any);
			} catch (err) {
				logger.error(`[Demo Cleanup] Error cleaning up content for tenant ${tenantId}:`, err);
			}

			// 4. Delete System Data via namespaced adapter methods
			// Cannot use db.crud.deleteMany for system tables because MongoDB's
			// normalizeCollectionName() adds a collection_ prefix, targeting wrong collections.
			// Instead, use the namespaced adapters: list all, filter by tenantId, delete individually.
			try {
				// Themes - list all, filter by tenantId, uninstall each
				const allThemes = await db.themes.getAllThemes();
				const tenantThemes = (allThemes || []).filter((t) => (t as unknown as { tenantId?: string }).tenantId === tenantId);
				for (const theme of tenantThemes) {
					await db.themes.uninstall(theme._id);
				}

				// Widgets are global (no tenantId), skip

				// System Preferences - clear user-scoped preferences for tenant users
				for (const userId of tenantUserIds) {
					await db.systemPreferences.clear('user', userId as DatabaseId);
				}

				// Virtual Folders - list all, filter by tenantId, delete each
				const foldersResult = await db.systemVirtualFolder.getAll();
				if (foldersResult.success && foldersResult.data) {
					const tenantFolders = foldersResult.data.filter((f) => (f as unknown as { tenantId?: string }).tenantId === tenantId);
					for (const folder of tenantFolders) {
						await db.systemVirtualFolder.delete(folder._id);
					}
				}

				// Website Tokens are global (no tenantId in schema), skip
			} catch (err) {
				logger.error(`[Demo Cleanup] Error cleaning up system data for tenant ${tenantId}:`, err);
			}

			// 5. Delete Auth Data (sessions, then users)
			try {
				for (const userId of tenantUserIds) {
					await db.auth.invalidateAllUserSessions(userId, tenantId);
				}
				await db.auth.deleteUsers(tenantUserIds, tenantId);
			} catch (err) {
				logger.error(`[Demo Cleanup] Error cleaning up auth data for tenant ${tenantId}:`, err);
			}
		}

		// 6. Global cleanup: expired sessions and tokens across all tenants
		await db.auth.deleteExpiredSessions();
		await db.auth.deleteExpiredTokens();

		logger.info(`[Demo Cleanup] Successfully removed ${tenantIds.length} tenants.`);
	} catch (error) {
		logger.error('[Demo Cleanup] Failed:', error);
	}
}
