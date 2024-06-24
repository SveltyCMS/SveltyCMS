import { publicEnv } from '@root/config/public';
import { redirect, type Actions, fail, error } from '@sveltejs/kit';
import fs from 'fs';
import Path from 'path';
import sharp from 'sharp';
import { removeExtension, sanitize } from '@src/utils/utils';
import crypto from 'crypto';
import mongoose from 'mongoose';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import type { Roles } from '@src/auth/types';

// Superforms
import { superValidate } from 'sveltekit-superforms/server';
import { addUserTokenSchema, changePasswordSchema } from '@utils/formSchemas';
import { zod } from 'sveltekit-superforms/adapters';

// Check if it's the first user
async function getIsFirstUser() {
	if (!auth) {
		console.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}
	return (await auth.getUserCount()) === 0;
}

// Load function that handles authentication and user validation
export async function load(event) {
	try {
		// Get the session cookie
		const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;

		if (!auth) {
			console.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// Validate the user's session
		const user = await auth.validateSession({ session_id });
		const isFirstUser = await getIsFirstUser();
		const addUserForm = await superValidate(event, zod(addUserTokenSchema));
		const changePasswordForm = await superValidate(event, zod(changePasswordSchema));

		if (!user) {
			throw redirect(302, `/login`);
		}

		return { user, addUserForm, changePasswordForm, isFirstUser };
	} catch (error) {
		console.error(error);
		throw redirect(302, `/login`);
	}
}

// Upload avatar image
async function saveAvatarImage(file: File, path: 'avatars' | string): Promise<string> {
	try {
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 20);
		const existingFile = await mongoose.models['media_images'].findOne({ hash });

		if (existingFile) {
			let fileUrl = `${publicEnv.MEDIA_FOLDER}/${existingFile.thumbnail.url}`;
			if (publicEnv.MEDIASERVER_URL) {
				fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
			}
			return fileUrl;
		}

		const { name: fileNameWithoutExt, ext } = removeExtension(file.name);
		const sanitizedBlobName = sanitize(fileNameWithoutExt);
		const format =
			ext === '.svg' ? 'svg' : publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format === 'original' ? ext : publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format;
		const url = `${path}/${hash}-${sanitizedBlobName}.${format}`;

		let resizedBuffer: Buffer;
		let info: any;

		if (format === 'svg') {
			resizedBuffer = buffer;
			info = { width: null, height: null };
		} else {
			const result = await sharp(buffer)
				.rotate()
				.resize({ width: 300 })
				.toFormat(format as keyof import('sharp').FormatEnum, {
					quality: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.quality
				})
				.toBuffer({ resolveWithObject: true });

			resizedBuffer = result.data;
			info = result.info;
		}

		const finalBuffer = buffer.byteLength < resizedBuffer.byteLength ? buffer : resizedBuffer;

		if (!fs.existsSync(Path.dirname(`${publicEnv.MEDIA_FOLDER}/${url}`))) {
			fs.mkdirSync(Path.dirname(`${publicEnv.MEDIA_FOLDER}/${url}`), { recursive: true });
		}

		fs.writeFileSync(`${publicEnv.MEDIA_FOLDER}/${url}`, finalBuffer);

		const imageData = {
			hash,
			thumbnail: {
				name: `${hash}-${sanitizedBlobName}.${format}`,
				url,
				type: `image/${format}`,
				size: file.size,
				width: info.width,
				height: info.height
			}
		};

		const savedImage = await mongoose.models['media_images'].create(imageData);

		let fileUrl = `${publicEnv.MEDIA_FOLDER}/${savedImage.thumbnail.url}`;
		if (publicEnv.MEDIASERVER_URL) {
			fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
		}

		return fileUrl;
	} catch (error) {
		console.error('Error in saveAvatarImage:', error);
		throw new Error('Failed to save avatar image');
	}
}

export const actions: Actions = {
	// Add a new user and token via email
	addUser: async (event) => {
		try {
			const { request, cookies } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				console.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });
			const addUserForm = await superValidate(request, zod(addUserTokenSchema));

			if (!user || user.role !== 'admin') {
				return fail(400, { message: "You don't have permission to add user" });
			}

			const { email, role, expiresIn } = addUserForm.data;
			const expirationTime = { '2 hrs': 7200, '12 hrs': 43200, '2 days': 172800, '1 week': 604800 }[expiresIn];

			if (!expirationTime) {
				return { form: addUserForm, message: 'Invalid value for token validity' };
			}

			if (await auth.checkUser({ email })) {
				return fail(400, { message: 'User already exists' });
			}

			const newUser = await auth.createUser({ email, role: role as Roles, lastAuthMethod: 'password', is_registered: false });
			if (!newUser) return fail(400, { message: 'unknown error' });

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

			return { form: addUserForm };
		} catch (error) {
			console.error(error);
			return fail(403, { message: "You don't have permission to add user" });
		}
	},

	// Change Password
	changePassword: async (event) => {
		try {
			const { request, cookies } = event;

			if (!auth) {
				console.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const changePasswordForm = await superValidate(request, zod(changePasswordSchema));
			const { password } = changePasswordForm.data;

			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
			const user = await auth.validateSession({ session_id });

			if (!user) {
				return { form: changePasswordForm, message: 'User does not exist or session expired' };
			}

			await auth.updateUserAttributes(user.id, { password, lastAuthMethod: 'password' });

			return { form: changePasswordForm };
		} catch (error) {
			console.error(error);
			return fail(403, { message: "You don't have permission to change password" });
		}
	},

	// Delete user
	deleteUser: async (event) => {
		try {
			const { cookies, request } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				console.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user || user.role !== 'admin') {
				return fail(403);
			}

			const data = await request.formData();
			const ids = data.getAll('id');

			for (const id of ids) {
				await auth.deleteUser(id as string);
			}
		} catch (error) {
			console.error(error);
			return fail(403, { message: "You don't have permission to delete user" });
		}
	},

	// Edit user
	editUser: async (event) => {
		try {
			const { cookies, request } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				console.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			// Validate the user's session
			const user = await auth.validateSession({ session_id });

			if (!user || user.role !== 'admin') {
				return fail(403);
			}

			const data = await request.formData();
			const infos = data.getAll('info');

			for (const info_json of infos) {
				const info = JSON.parse(info_json as string) as { id: string; field: 'email' | 'role' | 'name' | 'avatar'; value: string };
				const targetUser = await auth.checkUser({ id: info.id });

				if (targetUser) {
					await auth.updateUserAttributes(targetUser, { [info.field]: info.value });
				}
			}
		} catch (error) {
			console.error(error);
			return fail(403, { message: "You don't have permission to edit user" });
		}
	},

	// Block user
	blockUser: async (event) => {
		try {
			const { cookies, request } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				console.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user || user.role !== 'admin') {
				return fail(403);
			}

			const data = await request.formData();
			const user_idToBlock = data.get('id');

			const userToBlock = await auth.checkUser({ id: user_idToBlock as string });

			if (!userToBlock) {
				return fail(400, { message: 'User not found' });
			}

			const isFirstUser = await getIsFirstUser();

			if (isFirstUser) {
				return fail(400, { message: 'Cannot block the only admin user' });
			}

			await auth.updateUserAttributes(userToBlock, { blocked: true });

			return { success: true };
		} catch (error) {
			console.error(error);
			return fail(403, { message: "You don't have permission to block user" });
		}
	},

	// Unblock user
	unblockUser: async (event) => {
		try {
			const { cookies, request } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				console.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user || user.role !== 'admin') {
				return fail(403);
			}

			const data = await request.formData();
			const user_idToUnblock = data.get('id');
			const userToUnblock = await auth.checkUser({ id: user_idToUnblock as string });

			if (!userToUnblock) {
				return fail(400, { message: 'User not found' });
			}

			await auth.updateUserAttributes(userToUnblock, { blocked: false });

			return { success: true };
		} catch (error) {
			console.error(error);
			return fail(403, { message: "You don't have permission to unblock user" });
		}
	},

	// Save Avatar to database and to disk
	saveAvatar: async (event) => {
		try {
			const { request, cookies } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				console.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user) {
				return fail(403, { message: "You don't have permission to save avatar" });
			}

			const data = await request.formData();
			const avatarFile = data.get('avatar') as File;

			if (!avatarFile) {
				return fail(400, { message: 'No avatar file provided' });
			}

			const avatarUrl = await saveAvatarImage(avatarFile, 'avatars');
			await auth.updateUserAttributes(user.id, { avatar: avatarUrl });

			return { success: true, url: avatarUrl };
		} catch (error) {
			console.error(error);
			return fail(500, { message: 'Failed to save avatar' });
		}
	},

	// Delete Avatar from database and from disk
	deleteAvatar: async (event) => {
		try {
			const { cookies } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				console.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user) {
				return fail(403, { message: "You don't have permission to delete avatar" });
			}

			const avatarPath = user.avatar;

			if (!avatarPath) {
				return { success: true };
			}

			const avatarFilePath = Path.join(publicEnv.MEDIA_FOLDER, avatarPath);

			try {
				await fs.promises.unlink(avatarFilePath);
				await mongoose.models['media_images'].deleteOne({ 'thumbnail.url': avatarPath });
				await auth.updateUserAttributes(user.id, { avatar: '' });

				return { success: true };
			} catch (error) {
				console.error('Error deleting avatar:', error);
				return fail(500, { message: 'Failed to delete avatar' });
			}
		} catch (error) {
			console.error(error);
			return fail(500, { message: 'Failed to delete avatar' });
		}
	},

	// Edit user token
	editToken: async (event) => {
		try {
			const { cookies, request } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				console.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user || user.role !== 'admin') {
				return fail(403, { message: "You don't have permission to edit tokens" });
			}

			const data = await request.formData();
			const tokenId = data.get('id');
			const expiresIn = data.get('expiresIn');

			const token = await mongoose.models['tokens'].findById(tokenId);

			if (!token) {
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
				return fail(400, { message: 'Invalid value for token validity' });
			}

			const expiresAt = new Date(Date.now() + expirationTime * 1000);
			await mongoose.models['tokens'].updateOne({ _id: tokenId }, { expiresAt });

			return { success: true, message: 'Token updated successfully' };
		} catch (error) {
			console.error(error);
			return fail(500, { message: 'Failed to edit token' });
		}
	},

	// Delete user token
	deleteToken: async (event) => {
		try {
			const { cookies, request } = event;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

			if (!auth) {
				console.error('Authentication system is not initialized');
				throw error(500, 'Internal Server Error');
			}

			const user = await auth.validateSession({ session_id });

			if (!user || user.role !== 'admin') {
				return fail(403, { message: "You don't have permission to delete tokens" });
			}

			const data = await request.formData();
			const tokenId = data.get('id');

			const token = await mongoose.models['tokens'].findById(tokenId);

			if (!token) {
				return fail(404, { message: 'Token not found' });
			}

			await mongoose.models['tokens'].deleteOne({ _id: tokenId });

			return { success: true, message: 'Token deleted successfully' };
		} catch (error) {
			console.error(error);
			return fail(500, { message: 'Failed to delete token' });
		}
	}
};
