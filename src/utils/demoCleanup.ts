/**
 * @file src/utils/demoCleanup.ts
 * @description Utility to clean up expired demo tenants in DEMO mode.
 *
 * This function identifies tenants that were created over 60 minutes ago
 * and removes all associated data from the database to reset the demo environment.
 * It is intended to be run periodically (e.g., via a cron job).
 */

import { logger } from '@utils/logger.server';
import mongoose from 'mongoose';
import { SystemSettingModel } from '@src/databases/mongodb/models/systemSetting';
import { ThemeModel } from '@src/databases/mongodb/models/theme';
import { ContentStructureModel } from '@src/databases/mongodb/models/contentStructure';
import { WebsiteTokenModel } from '@src/databases/mongodb/models/websiteToken';
import { getPrivateEnv } from '@src/databases/db';

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

	// Threshold: 60 minutes
	const EXPIRATION_MS = 60 * 60 * 1000;
	const cutoffDate = new Date(Date.now() - EXPIRATION_MS);

	try {
		// Access models that are not exported directly
		// We assume these models are already registered by the application startup
		const User = mongoose.models.auth_users || mongoose.model('auth_users');
		const Session = mongoose.models.auth_sessions || mongoose.model('auth_sessions');

		// 1. Identify expired tenants
		// We look for the 'admin' user created during seeding for that tenant
		const expiredUsers = await User.find({
			tenantId: { $exists: true, $ne: null },
			createdAt: { $lt: cutoffDate },
			role: 'admin'
		}).select('tenantId');

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const tenantIds = [...new Set(expiredUsers.map((u: any) => u.tenantId).filter(Boolean))];

		if (tenantIds.length === 0) return;

		logger.info(`🧹 [Demo Cleanup] Found ${tenantIds.length} expired tenants. Starting cleanup...`);

		// Import fs and path for file deletion
		const fs = await import('fs/promises');
		const path = await import('path');
		const { MediaModel } = await import('@src/databases/mongodb/models/media');

		for (const tenantId of tenantIds) {
			if (!tenantId) continue;
			logger.debug(`🗑️ [Demo Cleanup] Deleting tenant: ${tenantId}`);

			// 2. Delete Physical Files & Media Records (NEW)
			try {
				const tenantMedia = await MediaModel.find({ tenantId });

				if (tenantMedia.length > 0) {
					logger.debug(`[Demo Cleanup] Deleting ${tenantMedia.length} files for tenant ${tenantId}`);

					for (const media of tenantMedia) {
						if (media.path) {
							try {
								// Construct absolute path if needed, or use as is if absolute
								// Assuming media.path is relative to project root or absolute
								const filePath = path.resolve(media.path);
								await fs.unlink(filePath);
							} catch (err) {
								// Ignore file not found errors
								if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
									logger.warn(`[Demo Cleanup] Failed to delete file ${media.path}:`, err);
								}
							}
						}
					}
					// Delete media records
					await MediaModel.deleteMany({ tenantId });
				}
			} catch (err) {
				logger.error(`[Demo Cleanup] Error cleaning up media for tenant ${tenantId}:`, err);
			}

			// 3. Delete Dynamic Content
			// We iterate through the ContentStructure to find collection names
			const collections = await ContentStructureModel.find({
				tenantId,
				nodeType: 'collection'
			});

			for (const col of collections) {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const c = col as any;
				if (c.name) {
					try {
						// Attempt to delete data from the dynamic collection
						// We use the native MongoDB driver to avoid Mongoose model compilation issues
						const collectionName = c.name; // Assuming collection name matches structure name
						// Note: In a real multi-tenant setup, verify if collection names are prefixed or shared.
						// Here we assume shared collections with tenantId field.
						await mongoose.connection.db?.collection(collectionName).deleteMany({ tenantId });
					} catch (err) {
						// Ignore errors if collection doesn't exist
					}
				}
			}

			// 4. Delete System Data
			await Promise.all([
				User.deleteMany({ tenantId }),
				Session.deleteMany({ tenantId }),
				SystemSettingModel.deleteMany({ tenantId }),
				ThemeModel.deleteMany({ tenantId }),
				ContentStructureModel.deleteMany({ tenantId }),
				WebsiteTokenModel.deleteMany({ tenantId }),
				// Role is a dynamic model in authComposition, so we access the collection directly
				mongoose.connection.db?.collection('auth_roles').deleteMany({ tenantId })
			]);
		}

		logger.info(`✨ [Demo Cleanup] Successfully removed ${tenantIds.length} tenants.`);
	} catch (error) {
		logger.error('❌ [Demo Cleanup] Failed:', error);
	}
}
