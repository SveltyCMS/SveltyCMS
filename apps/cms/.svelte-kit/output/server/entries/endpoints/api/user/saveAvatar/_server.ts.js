import { error, json } from '@sveltejs/kit';
import { getPrivateSettingSync } from '../../../../../chunks/settingsService.js';
import { a as auth } from '../../../../../chunks/db.js';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { cacheService } from '../../../../../chunks/CacheService.js';
import { m as moveMediaToTrash, s as saveAvatarImage } from '../../../../../chunks/mediaStorage.server.js';
const POST = async ({ request, locals }) => {
	try {
		if (!locals.user) {
			throw error(401, 'Unauthorized');
		}
		if (!auth) {
			throw error(500, 'Authentication system not available');
		}
		const formData = await request.formData();
		const targetUserId = formData.get('userId') || formData.get('user_id') || locals.user._id;
		const isEditingSelf = targetUserId === locals.user._id;
		if (getPrivateSettingSync('MULTI_TENANT') && !isEditingSelf) {
			const tenantId = locals.tenantId;
			const targetUser = await auth.getUserById(targetUserId, tenantId);
			if (!targetUser || targetUser.tenantId !== tenantId) {
				logger.warn('Admin attempted to update avatar for user outside their tenant', {
					adminId: locals.user._id,
					targetUserId,
					tenantId
				});
				return json(
					{
						error: 'Forbidden: You can only update avatars for users within your own tenant.'
					},
					{ status: 403 }
				);
			}
		}
		const avatarFile = formData.get('avatar');
		if (!avatarFile) {
			logger.error('No avatar file provided', { userId: locals.user._id, targetUserId });
			throw error(400, 'No avatar file provided');
		}
		const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif'];
		if (!allowedTypes.includes(avatarFile.type)) {
			logger.error('Invalid file type for avatar', {
				userId: locals.user._id,
				targetUserId,
				fileType: avatarFile.type
			});
			throw error(400, 'Invalid file type. Only JPEG, PNG, GIF, WebP, and SVG are allowed.');
		}
		const currentUser = await auth.getUserById(targetUserId);
		if (currentUser && currentUser.avatar) {
			try {
				await moveMediaToTrash(currentUser.avatar);
				logger.info('Old avatar moved to trash', { userId: targetUserId, oldAvatar: currentUser.avatar });
			} catch (err) {
				logger.warn('Failed to move old avatar to trash. Proceeding with new avatar upload.', {
					userId: targetUserId,
					error: err instanceof Error ? err.message : String(err)
				});
			}
		}
		const avatarUrl = await saveAvatarImage(avatarFile, targetUserId);
		await auth.updateUserAttributes(targetUserId, { avatar: avatarUrl }, locals.tenantId);
		const session_id = locals.session_id;
		if (session_id) {
			const user = await auth.validateSession(session_id);
			await cacheService.set(session_id, { user, timestamp: Date.now() }, 3600);
		}
		try {
			await cacheService.clearByPattern('api:*:/api/admin/users*', locals.tenantId);
			logger.debug('Cache invalidated for users list after avatar update');
		} catch (cacheError) {
			logger.warn('Failed to invalidate cache after avatar update', { error: cacheError });
		}
		logger.info('Avatar saved successfully', { userId: targetUserId, avatarUrl });
		return json({
			success: true,
			message: 'Avatar saved successfully',
			avatarUrl
		});
	} catch (err) {
		const httpError = err;
		const status = httpError.status || 500;
		const message = httpError.body?.message || 'Internal Server Error';
		logger.error('Error in saveAvatar API:', {
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
export { POST };
//# sourceMappingURL=_server.ts.js.map
