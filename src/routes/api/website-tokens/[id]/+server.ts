/**
 * @file src/routes/api/website-tokens/[id]/+server.ts
 * @description Handles DELETE requests for website tokens.
 */

import { dbAdapter } from '@src/databases/db';
import type { DatabaseId } from '@src/databases/db-interface';
// Unified Error Handling
import { apiHandler } from '@utils/api-handler';
import { AppError } from '@utils/error-handling';
import { logger } from '@utils/logger.server';
import { withTenant } from '@src/databases/db-adapter-wrapper';
import { auditLogService, AuditEventType } from '@src/services/audit-log-service';

export const DELETE = apiHandler(async ({ locals, params }) => {
	if (!locals.user) {
		throw new AppError('Unauthorized', 401, 'UNAUTHORIZED');
	}

	if (!dbAdapter) {
		throw new AppError('Database not available', 500, 'DB_UNAVAILABLE');
	}

	const { id } = params;

	if (!id) {
		throw new AppError('Token ID is required', 400, 'MISSING_ID');
	}

	const result = await withTenant(
		locals.tenantId,
		async () => {
			return await dbAdapter!.system.websiteTokens.delete(id as DatabaseId);
		},
		{ collection: 'websiteTokens' }
	);

	if (!result.success) {
		logger.error(`Failed to delete website token ${id}:`, result.error);
		throw new AppError('Failed to delete website token', 500, 'DELETE_TOKEN_FAILED');
	}

	await auditLogService.logEvent({
		action: 'Deleted website token',
		actorId: locals.user._id as DatabaseId,
		actorEmail: locals.user.email,
		eventType: AuditEventType.TOKEN_DELETED,
		result: 'success',
		severity: 'medium',
		targetId: id as DatabaseId,
		targetType: 'token',
		details: { tokenId: id }
	});

	return new Response(null, { status: 204 });
});
