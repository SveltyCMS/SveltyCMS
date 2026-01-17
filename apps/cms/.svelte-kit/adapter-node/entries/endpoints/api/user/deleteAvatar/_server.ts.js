import { error, json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { a as auth } from '../../../../../chunks/db.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { m as moveMediaToTrash } from '../../../../../chunks/mediaStorage.server.js';
import { cacheService } from '../../../../../chunks/CacheService.js';
const DELETE = async ({ request, locals }) => {
	const { user: currentUser, tenantId } = locals;
	try {
		if (!currentUser) {
			throw error(401, 'Unauthorized');
		}
		if (getPrivateSettingSync('MULTI_TENANT') && !tenantId) {
			throw error(400, 'Tenant could not be identified for this operation.');
		}
		let targetUserId = currentUser._id;
		let avatarUrlToDelete = null;
		try {
			const body = await request.json();
			if (body.userId) {
				targetUserId = body.userId;
			}
			if (body.avatarUrl) {
				avatarUrlToDelete = body.avatarUrl;
			}
		} catch {}
		const isEditingSelf = currentUser._id === targetUserId;
		if (getPrivateSettingSync('MULTI_TENANT') && !isEditingSelf) {
			if (!auth) {
				logger.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error: Auth system not initialized');
			}
			const targetUser = await auth.getUserById(targetUserId, tenantId);
			if (!targetUser || targetUser.tenantId !== tenantId) {
				logger.warn('Admin attempted to delete avatar for user outside their tenant', {
					adminId: currentUser._id,
					targetUserId,
					tenantId
				});
				throw error(403, 'Forbidden: You can only delete avatars for users within your own tenant.');
			}
		}
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error: Auth system not initialized');
		}
		const user = await auth.getUserById(targetUserId, tenantId);
		if (!user) {
			throw error(404, 'User not found');
		}
		const avatarToDelete = avatarUrlToDelete || user.avatar;
		if (avatarToDelete && avatarToDelete !== '/Default_User.svg') {
			try {
				await moveMediaToTrash(avatarToDelete);
				logger.info('Avatar moved to trash successfully', { userId: user._id, avatar: avatarToDelete, deletedBy: currentUser._id, tenantId });
			} catch (moveError) {
				logger.error('Error in moveMediaToTrash', {
					userId: user._id,
					avatar: avatarToDelete,
					error: moveError,
					errorMessage: moveError instanceof Error ? moveError.message : String(moveError),
					errorStack: moveError instanceof Error ? moveError.stack : void 0
				});
				if (moveError instanceof Error && moveError.message.includes('ENOENT')) {
					logger.warn('Avatar file not found, but proceeding to remove it from user profile.', {
						userId: user._id,
						avatar: avatarToDelete,
						error: moveError.message
					});
				} else {
					const errorMsg = moveError instanceof Error ? moveError.message : String(moveError);
					logger.error(`Failed to move avatar file to trash: ${errorMsg}`, { userId: user._id });
					throw error(500, `Failed to move avatar to trash: ${errorMsg}`);
				}
			}
		} else {
			logger.info('No avatar to move to trash for user.', { userId: user._id, tenantId });
			return json({ success: true, message: 'No avatar to remove.' });
		}
		await auth.updateUserAttributes(targetUserId, { avatar: void 0 }, tenantId);
		logger.info('User avatar attribute removed from profile.', { userId: targetUserId, removedBy: currentUser._id, tenantId });
		try {
			await cacheService.clearByPattern('api:*:/api/admin/users*', tenantId);
			logger.debug('Cache invalidated for users list after avatar deletion');
		} catch (cacheError) {
			logger.warn('Failed to invalidate cache after avatar deletion', { error: cacheError });
		}
		const defaultUrl = '/Default_User.svg';
		return json({ success: true, message: 'Avatar removed successfully', avatarUrl: defaultUrl });
	} catch (err) {
		const httpError = err;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'Internal Server Error';
		logger.error('Error in deleteAvatar API:', {
			error: message,
			stack: err instanceof Error ? err.stack : void 0,
			userId: locals.user?._id,
			tenantId: locals.tenantId,
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
export { DELETE };
//# sourceMappingURL=_server.ts.js.map
