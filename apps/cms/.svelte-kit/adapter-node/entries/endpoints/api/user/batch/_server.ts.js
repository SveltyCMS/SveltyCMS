import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { error, json } from '@sveltejs/kit';
import { a as auth } from '../../../../../chunks/db.js';
import { object, picklist, array, pipe, string, minLength, parse } from 'valibot';
import { l as logger } from '../../../../../chunks/logger.server.js';
const batchUserActionSchema = object({
	userIds: array(pipe(string(), minLength(1, 'User ID cannot be empty.'))),
	action: picklist(['delete', 'block', 'unblock'], 'Invalid action specified.')
});
const POST = async ({ request, locals }) => {
	try {
		const { user, tenantId } = locals;
		const body = await request.json().catch(() => {
			throw error(400, 'Invalid JSON in request body');
		});
		const { userIds, action } = parse(batchUserActionSchema, body);
		if (userIds.some((id) => id === user?._id)) {
			throw error(400, 'You cannot perform batch actions on your own account.');
		}
		if (!auth) {
			throw error(500, 'Authentication system is not initialized');
		}
		if (getPrivateSettingSync('MULTI_TENANT')) {
			if (!tenantId) {
				throw error(500, 'Tenant could not be identified for this operation.');
			}
			const userChecks = await Promise.all(
				userIds.map(async (userId) => {
					return await auth.getUserById(userId, tenantId);
				})
			);
			if (userChecks.some((u) => u === null)) {
				logger.warn(`Attempt to act on users outside of tenant or non-existent users`, {
					userId: user?._id,
					tenantId,
					requestedUserIds: userIds
				});
				throw error(403, 'Forbidden: One or more user IDs do not belong to your tenant or do not exist.');
			}
		}
		let successMessage = '';
		switch (action) {
			case 'delete': {
				let totalDeleted = 0;
				let totalSessionsDeleted = 0;
				for (const userId of userIds) {
					const result = await auth.deleteUserAndSessions(userId, tenantId);
					if (result.success && result.data) {
						totalDeleted++;
						totalSessionsDeleted += result.data.deletedSessionCount || 0;
					} else {
						const errorMsg = !result.success && 'error' in result ? result.error?.message : 'Unknown error';
						logger.warn(`Failed to delete user or sessions`, {
							userId,
							error: errorMsg,
							tenantId
						});
					}
				}
				if (totalDeleted === 0) {
					throw error(500, 'Failed to delete any users');
				}
				successMessage =
					totalDeleted === userIds.length
						? `${totalDeleted} user(s) and ${totalSessionsDeleted} session(s) deleted successfully.`
						: `${totalDeleted} of ${userIds.length} user(s) deleted (${totalSessionsDeleted} sessions cleaned up). Some deletions failed.`;
				logger.info('User deletion completed', {
					requested: userIds.length,
					deleted: totalDeleted,
					sessionsDeleted: totalSessionsDeleted,
					tenantId
				});
				break;
			}
			case 'block': {
				const result = await auth.blockUsers(userIds, tenantId);
				if (!result.success) {
					throw error(500, `Failed to block users: ${result.error}`);
				}
				successMessage = 'Users blocked successfully.';
				break;
			}
			case 'unblock': {
				const result = await auth.unblockUsers(userIds, tenantId);
				if (!result.success) {
					throw error(500, `Failed to unblock users: ${result.error}`);
				}
				successMessage = 'Users unblocked successfully.';
				break;
			}
		}
		logger.info(`Batch user action '${action}' completed.`, {
			affectedIds: userIds,
			executedBy: user?._id,
			tenantId
		});
		const { invalidateUserCountCache } = await import('../../../../../chunks/handleAuthorization.js');
		invalidateUserCountCache(tenantId);
		return json({ success: true, message: successMessage });
	} catch (err) {
		if (err instanceof Error && err.name === 'ValiError') {
			const valiError = err;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for user batch API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}
		const httpError = err;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred.';
		logger.error('Error in user batch API:', {
			error: message,
			stack: err instanceof Error ? err.stack : void 0,
			userId: locals.user?._id,
			status
		});
		return json({ success: false, message: status === 500 ? 'Internal Server Error' : message }, { status });
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
