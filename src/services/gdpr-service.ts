/**
 * @file src/services/GDPRService.ts
 * @description GDPR Compliance Service for SveltyCMS.
 * Handles "Right to Erasure" and "Right to Access" / Data Portability.
 *
 * Features:
 * - Export user data
 * - Anonymize user data
 *
 */

import { dbAdapter } from '@databases/db';
import { logger } from '@utils/logger.server';
import { auditLogService } from './audit/audit-log-service';

export class GDPRService {
	private static instance: GDPRService;

	private constructor() {}

	public static getInstance(): GDPRService {
		if (!GDPRService.instance) {
			GDPRService.instance = new GDPRService();
		}
		return GDPRService.instance;
	}

	/**
	 * Right to Access (Article 20)
	 * Exports all known data for a specific user.
	 */
	public async exportUserData(userId: string): Promise<Record<string, unknown>> {
		if (!dbAdapter) {
			throw new Error('Database adapter is not initialized');
		}

		try {
			// 1. Fetch Core User Profile using Auth Adapter
			const userResult = await dbAdapter.auth.getUserById(userId);

			if (!(userResult.success && userResult.data)) {
				throw new Error('User not found');
			}
			const user = userResult.data;

			// 2. Fetch User Activity (Audit Logs)
			// We filter the audit logs for actions by this user
			const allLogs = await auditLogService.getLogs(1000);
			const userLogs = allLogs.filter((log) => log.actor?.id === userId);

			// 3. Log the Export Request
			await auditLogService.log(
				'gdpr.export',
				{ id: userId, email: user.email || '', ip: 'system' },
				{ type: 'user', id: userId },
				{ method: 'GDPRService.exportUserData' }
			);

			return {
				profile: user,
				history: userLogs,
				metadata: {
					exportedAt: new Date().toISOString(),
					version: '1.0'
				}
			};
		} catch (error) {
			logger.error(`GDPR Export Failed: ${error instanceof Error ? error.message : String(error)}`, { userId });
			throw error;
		}
	}

	/**
	 * Right to Erasure (Article 17)
	 * Anonymizes PII while preserving data integrity.
	 */
	public async anonymizeUser(userId: string, reason = 'User Request'): Promise<boolean> {
		if (!dbAdapter) {
			logger.error('GDPR Erasure Failed: Database adapter not initialized');
			return false;
		}

		try {
			// 1. Fetch User to verify existence and get original email for logging
			const userResult = await dbAdapter.auth.getUserById(userId);
			if (!(userResult.success && userResult.data)) {
				throw new Error('User not found');
			}
			const user = userResult.data;

			const anonymizedEmail = `deleted-${userId.substring(0, 8)}@anonymized.sveltycms.com`;

			// 2. Perform Soft Delete / Anonymization using Auth Adapter
			const updateResult = await dbAdapter.auth.updateUserAttributes(userId, {
				email: anonymizedEmail,
				username: `ghost-${userId.substring(0, 8)}`
			});

			if (!updateResult.success) {
				throw new Error(updateResult.error?.message || 'Failed to update user attributes');
			}

			// 3. Log the Erasure
			await auditLogService.log(
				'gdpr.erasure',
				{ id: userId, email: user.email || '', ip: 'system' }, // Log with original identity one last time
				{ type: 'user', id: userId },
				{ reason, newIdentity: anonymizedEmail }
			);

			logger.info(`User ${userId} anonymized successfully.`);
			return true;
		} catch (error) {
			logger.error(`GDPR Erasure Failed: ${error instanceof Error ? error.message : String(error)}`, { userId });
			return false;
		}
	}
}

export const gdprService = GDPRService.getInstance();
