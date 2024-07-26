import { publicEnv } from '@root/config/public';
import { redirect, type Actions, fail, error } from '@sveltejs/kit';
import fs from 'fs';
import Path from 'path';

// Auth
import { auth, dbAdapter } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import type { Role } from '@src/auth/types';

// Superforms
import { superValidate } from 'sveltekit-superforms/server';
import { addUserTokenSchema, changePasswordSchema } from '@utils/formSchemas';
import { zod } from 'sveltekit-superforms/adapters';

// Logger
import { logger } from '@src/utils/logger';

// Import saveAvatarImage from utils/media
import { saveAvatarImage } from '@src/utils/media';

// Check if it's the first user
async function getIsFirstUser() {
	if (!auth) {
		logger.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}
	const userCount = await auth.getUserCount();
	logger.debug(`Current user count: ${userCount}`);
	return userCount === 0;
}

// Load function that handles authentication and user validation
export async function load(event) {
	try {
		// Get the session cookie
		const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// Validate the user's session
		const user = await auth.validateSession({ session_id });
		const isFirstUser = await getIsFirstUser();
		const addUserForm = await superValidate(event, zod(addUserTokenSchema));
		const changePasswordForm = await superValidate(event, zod(changePasswordSchema));

		if (!user) {
			logger.warn('Invalid session, redirecting to login');
			throw redirect(302, `/login`);
		}
		let { _id, ...rest } = user;
		return { user: { _id: _id.toString(), ...rest }, addUserForm, changePasswordForm, isFirstUser };
	} catch (err) {
		logger.error('Error during load function:', err as Error);
		throw redirect(302, `/login`);
	}
}

export const actions: Actions = {
	// Add a new user and token via email
	addUser: async (event) => {
		try {
			const { request, cookies } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				logger.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });
			const addUserForm = await superValidate(request, zod(addUserTokenSchema));

			if (!user || user.role !== 'admin') {
				logger.warn('Unauthorized user attempted to add a new user');
				return fail(400, { message: "You don't have permission to add user" });
			}

			const { email, role, expiresIn } = addUserForm.data;
			const expirationTime = { '2 hrs': 7200, '12 hrs': 43200, '2 days': 172800, '1 week': 604800 }[expiresIn];

			if (!expirationTime) {
				logger.warn('Invalid expiration time provided');
				return { form: addUserForm, message: 'Invalid value for token validity' };
			}

			if (await auth.checkUser({ email })) {
				logger.warn(`User with email ${email} already exists`);
				return fail(400, { message: 'User already exists' });
			}

			const newUser = await auth.createUser({ email, role: role as Role, lastAuthMethod: 'password', isRegistered: false });
			if (!newUser) {
				logger.error('Unknown error occurred while creating a new user');
				return fail(400, { message: 'Unknown error' });
			}

			const token = await auth.createToken(newUser.id, expirationTime * 1000);
			await fetch('/api/sendMail', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					email,
					subject: 'User Token',
					message: 'User Token',
					templateName: 'userToken',
					props: { email, token, role, expiresIn: expirationTime }
				})
			});

			logger.info(`New user created: ${email}`);
			return { form: addUserForm };
		} catch (err) {
			logger.error('Error in addUser action:', err as Error);
			return fail(403, { message: "You don't have permission to add user" });
		}
	},

	// Change Password
	changePassword: async (event) => {
		try {
			const { request, cookies } = event;

			if (!auth) {
				logger.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const changePasswordForm = await superValidate(request, zod(changePasswordSchema));
			const { password } = changePasswordForm.data;

			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
			const user = await auth.validateSession({ session_id });

			if (!user) {
				logger.warn('User does not exist or session expired');
				return { form: changePasswordForm, message: 'User does not exist or session expired' };
			}

			await auth.updateUserAttributes(user.id, { password, lastAuthMethod: 'password' });

			logger.info(`Password changed for user: ${user.email}`);
			return { form: changePasswordForm };
		} catch (err) {
			logger.error('Error in changePassword action:', err as Error);
			return fail(403, { message: "You don't have permission to change password" });
		}
	},

	// Delete user
	deleteUser: async (event) => {
		try {
			const { cookies, request } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				logger.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user || user.role !== 'admin') {
				logger.warn('Unauthorized user attempted to delete a user');
				return fail(403);
			}

			const data = await request.formData();
			const ids = data.getAll('id');

			for (const id of ids) {
				await auth.deleteUser(id as string);
				logger.info(`User deleted: ${id}`);
			}
		} catch (err) {
			logger.error('Error in deleteUser action:', err as Error);
			return fail(403, { message: "You don't have permission to delete user" });
		}
	},

	// Edit user
	editUser: async (event) => {
		try {
			const { cookies, request } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				logger.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user || user.role !== 'admin') {
				logger.warn('Unauthorized user attempted to edit a user');
				return fail(403);
			}

			const data = await request.formData();
			const infos = data.getAll('info');

			for (const info_json of infos) {
				const info = JSON.parse(info_json as string) as { id: string; field: 'email' | 'role' | 'name' | 'avatar'; value: string };
				const targetUser = await auth.checkUser({ id: info.id });

				if (targetUser) {
					await auth.updateUserAttributes(targetUser, { [info.field]: info.value });
					logger.info(`User ${info.id} updated: ${info.field} to ${info.value}`);
				}
			}
		} catch (err) {
			logger.error('Error in editUser action:', err);
			return fail(403, { message: "You don't have permission to edit user" });
		}
	},

	// Block user
	blockUser: async (event) => {
		try {
			const { cookies, request } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				logger.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user || user.role !== 'admin') {
				logger.warn('Unauthorized user attempted to block a user');
				return fail(403);
			}

			const data = await request.formData();
			const userIdToBlock = data.get('id');

			const userToBlock = await auth.checkUser({ id: userIdToBlock as string });

			if (!userToBlock) {
				logger.warn(`User to block not found: ${userIdToBlock}`);
				return fail(400, { message: 'User not found' });
			}

			const isFirstUser = await getIsFirstUser();

			if (isFirstUser) {
				logger.warn('Attempted to block the only admin user');
				return fail(400, { message: 'Cannot block the only admin user' });
			}

			await auth.updateUserAttributes(userToBlock, { blocked: true });

			logger.info(`User blocked: ${userIdToBlock}`);
			return { success: true };
		} catch (err) {
			logger.error('Error in blockUser action:', err);
			return fail(403, { message: "You don't have permission to block user" });
		}
	},

	// Unblock user
	unblockUser: async (event) => {
		try {
			const { cookies, request } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				logger.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user || user.role !== 'admin') {
				logger.warn('Unauthorized user attempted to unblock a user');
				return fail(403);
			}

			const data = await request.formData();
			const userIdToUnblock = data.get('id');
			const userToUnblock = await auth.checkUser({ id: userIdToUnblock as string });

			if (!userToUnblock) {
				logger.warn(`User to unblock not found: ${userIdToUnblock}`);
				return fail(400, { message: 'User not found' });
			}

			await auth.updateUserAttributes(userToUnblock, { blocked: false });

			logger.info(`User unblocked: ${userIdToUnblock}`);
			return { success: true };
		} catch (err) {
			logger.error('Error in unblockUser action:', err);
			return fail(403, { message: "You don't have permission to unblock user" });
		}
	},

	// Save Avatar to database and to disk
	saveAvatar: async (event) => {
		try {
			const { request, cookies } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				logger.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user) {
				logger.warn('Unauthorized user attempted to save avatar');
				return fail(403, { message: "You don't have permission to save avatar" });
			}

			const data = await request.formData();
			const avatarFile = data.get('avatar') as File;

			if (!avatarFile) {
				logger.warn('No avatar file provided');
				return fail(400, { message: 'No avatar file provided' });
			}

			const avatarUrl = await saveAvatarImage(avatarFile, 'avatars');
			await auth.updateUserAttributes(user.id, { avatar: avatarUrl });

			logger.info(`Avatar saved for user: ${user.id}`);
			return { success: true, url: avatarUrl };
		} catch (err) {
			logger.error('Error in saveAvatar action:', err);
			return fail(500, { message: 'Failed to save avatar' });
		}
	},

	// Delete Avatar from database and from disk
	deleteAvatar: async (event) => {
		try {
			const { cookies } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth || !dbAdapter) {
				logger.error('Authentication system or database adapter is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user) {
				logger.warn('Unauthorized user attempted to delete avatar');
				return fail(403, { message: "You don't have permission to delete avatar" });
			}

			const avatarPath = user.avatar;

			if (!avatarPath) {
				logger.info('No avatar to delete');
				return { success: true };
			}

			const avatarFilePath = Path.join(publicEnv.MEDIA_FOLDER, avatarPath);

			try {
				await fs.promises.unlink(avatarFilePath);
				await dbAdapter.deleteOne('media_images', { 'thumbnail.url': avatarPath });
				await auth.updateUserAttributes(user.id, { avatar: '' });

				logger.info(`Avatar deleted for user: ${user.id}`);
				return { success: true };
			} catch (err) {
				logger.error('Error deleting avatar:', err);
				return fail(500, { message: 'Failed to delete avatar' });
			}
		} catch (err) {
			logger.error('Error in deleteAvatar action:', err);
			return fail(500, { message: 'Failed to delete avatar' });
		}
	},

	// Edit user token
	editToken: async (event) => {
		try {
			const { cookies, request } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth || !dbAdapter) {
				logger.error('Authentication system or database adapter is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user || user.role !== 'admin') {
				logger.warn('Unauthorized user attempted to edit token');
				return fail(403, { message: "You don't have permission to edit tokens" });
			}

			const data = await request.formData();
			const tokenId = data.get('id');
			const expiresIn = data.get('expiresIn');

			const token = await dbAdapter.findOne('tokens', { _id: tokenId });

			if (!token) {
				logger.warn(`Token not found: ${tokenId}`);
				return fail(404, { message: 'Token not found' });
			}

			const expirationTimes = {
				'2 hrs': 2 * 60 * 60,
				'12 hrs': 12 * 60 * 60,
				'2 days': 2 * 24 * 60 * 60,
				'1 week': 7 * 24 * 60 * 60
			};

			const expirationTime = expirationTimes[expiresIn as string];

			if (!expirationTime) {
				logger.warn('Invalid expiration time provided for token');
				return fail(400, { message: 'Invalid value for token validity' });
			}

			const expiresAt = new Date(Date.now() + expirationTime * 1000);
			await dbAdapter.updateOne('tokens', { _id: tokenId }, { expiresAt });

			logger.info(`Token ${tokenId} updated with new expiration time`);
			return { success: true, message: 'Token updated successfully' };
		} catch (err) {
			logger.error('Error in editToken action:', err);
			return fail(500, { message: 'Failed to edit token' });
		}
	},

	// Delete user token
	deleteToken: async (event) => {
		try {
			const { cookies, request } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth || !dbAdapter) {
				logger.error('Authentication system or database adapter is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user || user.role !== 'admin') {
				logger.warn('Unauthorized user attempted to delete token');
				return fail(403, { message: "You don't have permission to delete tokens" });
			}

			const data = await request.formData();
			const tokenId = data.get('id');

			const token = await dbAdapter.findOne('tokens', { _id: tokenId });

			if (!token) {
				logger.warn(`Token not found: ${tokenId}`);
				return fail(404, { message: 'Token not found' });
			}

			await dbAdapter.deleteOne('tokens', { _id: tokenId });

			logger.info(`Token ${tokenId} deleted successfully`);
			return { success: true, message: 'Token deleted successfully' };
		} catch (err) {
			logger.error('Error in deleteToken action:', err);
			return fail(500, { message: 'Failed to delete token' });
		}
	}
};
