import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { error, json } from '@sveltejs/kit';
import { a as auth, S as SESSION_COOKIE_NAME } from '../../../../../chunks/db.js';
import { cacheService } from '../../../../../chunks/CacheService.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { object, optional, pipe, string, minLength, maxLength, email, parse } from 'valibot';
const baseUserDataSchema = object({
	email: optional(pipe(string(), email())),
	username: optional(pipe(string(), minLength(2, 'Username must be at least 2 characters'), maxLength(50, 'Username must not exceed 50 characters'))),
	password: optional(pipe(string(), minLength(8, 'Password must be at least 8 characters')))
});
const PUT = async ({ request, locals, cookies }) => {
	try {
		const { user, tenantId } = locals;
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}
		if (!user) {
			logger.warn('Unauthenticated request to updateUserAttributes');
			throw error(401, 'Unauthorized: Please log in to continue');
		}
		const body = await request.json();
		const { user_id: userIdToUpdate, newUserData } = body;
		if (!userIdToUpdate || typeof userIdToUpdate !== 'string' || userIdToUpdate.trim() === '') {
			throw error(400, 'A valid user_id must be provided.');
		}
		if (!newUserData || typeof newUserData !== 'object') {
			throw error(400, 'Valid newUserData must be provided.');
		}
		const isEditingSelf = user._id === userIdToUpdate;
		if (getPrivateSettingSync('MULTI_TENANT') && !isEditingSelf) {
			if (!tenantId) {
				throw error(500, 'Tenant could not be identified for this operation.');
			}
			const userToUpdate = await auth.getUserById(userIdToUpdate);
			if (!userToUpdate || userToUpdate.tenantId !== tenantId) {
				logger.warn('Admin attempted to edit a user outside their tenant.', {
					adminId: user?._id,
					adminTenantId: tenantId,
					targetUserId: userIdToUpdate,
					targetTenantId: userToUpdate?.tenantId
				});
				throw error(403, 'Forbidden: You can only edit users within your own tenant.');
			}
		}
		let schemaToUse = baseUserDataSchema;
		if (newUserData.role) {
			if (isEditingSelf) {
				logger.warn('User attempted to change their own role.', { userId: user._id, attemptedRole: newUserData.role });
				throw error(403, 'Forbidden: You cannot change your own role.');
			} else {
				schemaToUse = object({ ...baseUserDataSchema.entries, role: optional(string()) });
			}
		}
		const validatedData = parse(schemaToUse, newUserData);
		const updatedUser = await auth.updateUserAttributes(userIdToUpdate, validatedData);
		if (!updatedUser) {
			logger.error('updateUserAttributes returned null/undefined', {
				userIdToUpdate,
				validatedData
			});
			throw error(500, 'Failed to update user attributes');
		}
		if (isEditingSelf) {
			const sessionId = cookies.get(SESSION_COOKIE_NAME);
			if (sessionId) {
				try {
					await cacheService.delete(sessionId);
					logger.debug(`Session cache invalidated for self-updated user ${userIdToUpdate}`);
				} catch (cacheError) {
					logger.warn(`Failed to invalidate session cache during self-update: ${cacheError}`);
				}
			}
		}
		try {
			await cacheService.clearByPattern(`api:*:/api/admin/users*`, tenantId);
			logger.debug('Admin users list cache cleared after user update');
		} catch (cacheError) {
			logger.warn(`Failed to clear admin users cache: ${cacheError}`);
		}
		const { invalidateRolesCache } = await import('../../../../../chunks/handleAuthorization.js');
		invalidateRolesCache(tenantId);
		logger.info('User attributes updated successfully', {
			user_id: userIdToUpdate,
			updatedBy: user?._id,
			tenantId,
			updatedFields: Object.keys(validatedData)
		});
		return json({
			success: true,
			message: 'User updated successfully.',
			user: updatedUser
		});
	} catch (err) {
		if (err instanceof Error && err.name === 'ValiError') {
			const valiError = err;
			const issues = valiError.issues.map((issue) => issue.message).join(', ');
			logger.warn('Invalid input for updateUserAttributes API:', { issues });
			throw error(400, `Invalid input: ${issues}`);
		}
		const httpError = err;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'An unexpected error occurred while updating user attributes.';
		logger.error('Error in updateUserAttributes API:', {
			error: message,
			stack: err instanceof Error ? err.stack : void 0,
			userId: locals.user?._id,
			status
		});
		return json(
			{
				success: false,
				message: status === 500 ? 'Internal Server Error' : message
			},
			{ status }
		);
	}
};
export { PUT };
//# sourceMappingURL=_server.ts.js.map
