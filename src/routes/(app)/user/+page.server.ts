import { redirect, type Actions, fail } from '@sveltejs/kit';
import { publicEnv } from '@root/config/public';
import fs from 'fs';
import Path from 'path';
import sharp from 'sharp';
import { removeExtension, sanitize } from '@src/utils/utils';
import crypto from 'crypto';

// Auth
import { auth } from '@api/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import type { Roles } from '@src/auth/types';
import { createNewToken } from '@src/auth/tokens';
import mongoose from 'mongoose';

// Superforms
import { superValidate } from 'sveltekit-superforms/server';
import { addUserTokenSchema, changePasswordSchema } from '@utils/formSchemas';
import { zod } from 'sveltekit-superforms/adapters';

// Load function to check if user is authenticated
export async function load(event) {
	const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
	const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

	// Check if only one user is in the database
	const isFirstUser = (await auth.getUserCount()) === 0;

	// Superforms Validate addUserForm / change Password
	const addUserForm = await superValidate(event, zod(addUserTokenSchema));
	const changePasswordForm = await superValidate(event, zod(changePasswordSchema));

	if (!user) {
		redirect(302, `/login`);
	} else {
		return {
			user,
			addUserForm,
			changePasswordForm,
			isFirstUser
		};
	}
}

// Helper function to save avatar image
async function saveAvatarImage(file: File, path: 'avatars' | string) {
	try {
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const hash = crypto.createHash('sha256').update(buffer).digest('hex').slice(0, 20);
		const existingFile = await mongoose.models['media_images'].findOne({ hash });

		if (existingFile) {
			let fileUrl = `${publicEnv.MEDIA_FOLDER}/${existingFile.thumbnail.url}`; // Default to local path

			// If MEDIASERVER_URL is set, prepend it to the file path
			if (publicEnv.MEDIASERVER_URL) {
				fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
			}

			return fileUrl; // Return the existing file URL
		}

		const { name: fileNameWithoutExt, ext } = removeExtension(file.name); // Extract name without extension
		const sanitizedBlobName = sanitize(fileNameWithoutExt); // Sanitize the name to remove special characters
		const format =
			ext === '.svg' ? 'svg' : publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format === 'original' ? ext : publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.format;

		// Original image URL construction
		const url = `${path}/${hash}-${sanitizedBlobName}.${format}`;

		let resizedBuffer: Buffer;
		let info: any;

		if (format === 'svg') {
			resizedBuffer = buffer;
			info = { width: null, height: null }; // You might want to get SVG dimensions here
		} else {
			// Rotate and resize image
			const result = await sharp(buffer)
				.rotate() // Rotate image according to EXIF data
				.resize({ width: 300 }) // Resize the image to a width of 300 pixels
				.toFormat(format as keyof import('sharp').FormatEnum, {
					quality: publicEnv.MEDIA_OUTPUT_FORMAT_QUALITY.quality // Set the quality of the output image
				})
				.toBuffer({ resolveWithObject: true });
			resizedBuffer = result.data;
			info = result.info;
		}

		// Compare the sizes of the original and resized buffers, and choose the smaller one
		const finalBuffer = buffer.byteLength < resizedBuffer.byteLength ? buffer : resizedBuffer;

		// Create the folder if it doesn't exist
		if (!fs.existsSync(Path.dirname(`${publicEnv.MEDIA_FOLDER}/${url}`))) {
			fs.mkdirSync(Path.dirname(`${publicEnv.MEDIA_FOLDER}/${url}`), { recursive: true });
		}

		// Write the resized image to disk
		fs.writeFileSync(`${publicEnv.MEDIA_FOLDER}/${url}`, finalBuffer);

		// Save the image data to the database
		const imageData = {
			hash,
			thumbnail: {
				name: `${hash}-${sanitizedBlobName}.${format}`,
				url,
				type: `image/${format}`,
				size: file.size,
				width: info.width,
				height: info.height
				// createdAt: new Date(),
				// lastModified: new Date(file.lastModified)
			}
		};

		const savedImage = await mongoose.models['media_images'].create(imageData);

		let fileUrl = `${publicEnv.MEDIA_FOLDER}/${savedImage.thumbnail.url}`; // Default to local path

		// If MEDIASERVER_URL is set, prepend it to the file path
		if (publicEnv.MEDIASERVER_URL) {
			fileUrl = `${publicEnv.MEDIASERVER_URL}/${fileUrl}`;
		}

		return fileUrl; // Return the saved image URL
	} catch (error) {
		console.error('Error in saveAvatarImage:', error);
		throw new Error('Failed to save avatar image');
	}
}

export const actions: Actions = {
	// This action adds a new user to the system.
	addUser: async ({ request, cookies }) => {
		try {
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
			const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

			// Validate addUserForm data
			const addUserForm = await superValidate(request, zod(addUserTokenSchema));

			// If the user is not logged in, redirect them to the login page.
			if (!user || user.role != 'admin') {
				return fail(400, { message: "You don't have permission to add user" });
			}

			const email = addUserForm.data.email;
			const role = addUserForm.data.role as Roles;
			const expiresIn = addUserForm.data.expiresIn;

			// Calculate expiration time in seconds based on expiresIn value
			let expirationTime: number;

			switch (expiresIn) {
				case '2 hrs':
					expirationTime = 2 * 60 * 60;
					break;
				case '12 hrs': //default expires value
					expirationTime = 12 * 60 * 60;
					break;
				case '2 days':
					expirationTime = 2 * 24 * 60 * 60;
					break;
				case '1 week':
					expirationTime = 7 * 24 * 60 * 60;
					break;
				default:
					// Handle invalid expiresIn value
					return { form: addUserForm, message: 'Invalid value for token validity' };
			}

			if (await auth.checkUser({ email })) {
				return fail(400, { message: 'User already exists' });
			}

			const newUser = await auth.createUser({
				email,
				role,
				lastAuthMethod: 'password',
				is_registered: false
			});

			if (!newUser) return fail(400, { message: 'unknown error' });

			// Issue password token for new user
			const token = await createNewToken(newUser, newUser._id, email, expirationTime * 1000);
			console.log(token); // send token to user via email

			// Send the token to the user via email.
			await fetch('/api/sendMail', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					email: email,
					subject: 'User Token',
					message: 'User Token',
					templateName: 'userToken',
					props: {
						email: email,
						token: token,
						role: role,
						expiresIn: expirationTime
					}
				})
			});

			return { form: addUserForm };
		} catch (error) {
			console.error(error);
			return fail(403, { message: "You don't have permission to add user" });
		}
	},

	// This action changes the password for the current user.
	changePassword: async ({ request, cookies }) => {
		try {
			// Validate the form data.
			const changePasswordForm = await superValidate(request, zod(changePasswordSchema));
			const { password } = changePasswordForm.data;
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
			const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));
			// The user's session is invalid.
			if (!user) {
				return { form: changePasswordForm, message: 'User does not exist or session expired' };
			}

			// Update the user's authentication method.
			await auth.updateUserAttributes(user, { password, lastAuthMethod: 'password' });

			// Return the form data.
			return { form: changePasswordForm };
		} catch (error) {
			console.error(error);
			return fail(403, { message: "You don't have permission to change password" });
		}
	},

	// This action deletes a user from the system.
	deleteUser: async (event) => {
		try {
			const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
			const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

			if (!user || user.role != 'admin') {
				return fail(403);
			}

			const data = await event.request.formData();
			const ids = data.getAll('id');

			for (const id of ids) {
				await auth.deleteUser(id as string);
			}
		} catch (error) {
			console.error(error);
			return fail(403, { message: "You don't have permission to delete user" });
		}
	},

	// This action edits a user in the system.
	editUser: async (event) => {
		console.log('editUser called', event);
		try {
			const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
			const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

			if (!user || user.role != 'admin') {
				return fail(403);
			}

			const data = await event.request.formData();
			const infos = data.getAll('info');

			for (const info_json of infos) {
				// Parse the info object.
				const info = JSON.parse(info_json as string) as { id: string; field: 'email' | 'role' | 'name' | 'avatar'; value: string };
				const user = await auth.checkUser({ _id: info.id });
				console.log(user);
				if (user) {
					// Update the user's other attributes
					auth.updateUserAttributes(user, {
						[info.field]: info.value
					});
				}
			}
		} catch (error) {
			console.error(error);
			return fail(403, { message: "You don't have permission to edit user" });
		}
	},

	// This action blocks a user in the system.
	blockUser: async (event) => {
		try {
			const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
			const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

			if (!user || user.role !== 'admin') {
				return fail(403);
			}

			const data = await event.request.formData();
			const userIdToBlock = data.get('id');

			// Retrieve the user to block
			const userToBlock = await auth.checkUser({ _id: userIdToBlock as string });

			if (!userToBlock) {
				return fail(400, { message: 'User not found' });
			}

			// Check if there's only one user in the system (isFirst user)
			const isFirstUser = (await auth.getUserCount()) === 1;

			// If isFirst user exists, block operation is not allowed
			if (isFirstUser) {
				return fail(400, { message: 'Cannot block the only admin user' });
			}

			// Update the user's attributes to block them
			await auth.updateUserAttributes(userToBlock, {
				blocked: true
			});

			return { success: true };
		} catch (error) {
			console.error(error);
			return fail(403, { message: "You don't have permission to block user" });
		}
	},

	// This action unblocks a user in the system.
	unblockUser: async (event) => {
		try {
			const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
			const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

			if (!user || user.role != 'admin') {
				return fail(403);
			}

			const data = await event.request.formData();
			const userIdToUnblock = data.get('id');
			const userToUnblock = await auth.checkUser({ _id: userIdToUnblock as string });

			if (userToUnblock) {
				auth.updateUserAttributes(userToUnblock, {
					blocked: false
				});
			} else {
				return fail(400, { message: 'User not found' });
			}
		} catch (error) {
			console.error(error);
			return fail(403, { message: "You don't have permission to unblock user" });
		}
	},

	// This action saves an avatar image for a user.
	saveAvatar: async ({ request, cookies }) => {
		try {
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
			const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

			if (!user || user.role !== 'admin') {
				return fail(403, { message: "You don't have permission to save avatar" });
			}

			const data = await request.formData();
			const avatarFile = data.get('avatar') as File;

			if (!avatarFile) {
				return fail(400, { message: 'No avatar file provided' });
			}

			const avatarUrl = await saveAvatarImage(avatarFile, 'avatars');
			await auth.updateUserAttributes(user, { avatar: avatarUrl });

			return { success: true };
		} catch (error) {
			console.error(error);
			return fail(500, { message: 'Failed to save avatar' });
		}
	},

	// This action deletes a user's avatar image.
	deleteAvatar: async ({ cookies }) => {
		try {
			const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
			const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

			if (!user || user.role !== 'admin') {
				return fail(403, { message: "You don't have permission to delete avatar" });
			}

			const avatarPath = user.avatar;

			if (!avatarPath) {
				return { success: true }; // No avatar to delete
			}

			// Construct the path to the avatar file based on the new file management logic
			const avatarFilePath = Path.join(publicEnv.MEDIA_FOLDER, avatarPath);

			try {
				// Delete the avatar file
				await fs.promises.unlink(avatarFilePath);

				// Delete the avatar data from the media_images collection
				await mongoose.models['media_images'].deleteOne({ 'thumbnail.url': avatarPath });

				// Update the user's avatar attribute to empty string
				await auth.updateUserAttributes(user, { avatar: '' });

				return { success: true };
			} catch (error) {
				console.error(error);
				return fail(500, { message: 'Failed to delete avatar' });
			}
		} catch (error) {
			console.error(error);
			return fail(500, { message: 'Failed to delete avatar' });
		}
	},

	// This action edits an existing token for a user.
	editToken: async (event) => {
		try {
			const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
			const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

			if (!user || user.role !== 'admin') {
				return fail(403, { message: "You don't have permission to edit tokens" });
			}

			const data = await event.request.formData();
			const tokenId = data.get('id');
			const expiresIn = data.get('expiresIn');

			const token = await mongoose.models['tokens'].findById(tokenId);

			if (!token) {
				return fail(404, { message: 'Token not found' });
			}

			let expirationTime: number;
			switch (expiresIn) {
				case '2 hrs':
					expirationTime = 2 * 60 * 60;
					break;
				case '12 hrs': // default expires value
					expirationTime = 12 * 60 * 60;
					break;
				case '2 days':
					expirationTime = 2 * 24 * 60 * 60;
					break;
				case '1 week':
					expirationTime = 7 * 24 * 60 * 60;
					break;
				default:
					// Handle invalid expiresIn value
					return fail(400, { message: 'Invalid value for token validity' });
			}

			if (expirationTime === null) {
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

	// This action deletes an existing token for a user.
	deleteToken: async (event) => {
		try {
			const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
			const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

			if (!user || user.role !== 'admin') {
				return fail(403, { message: "You don't have permission to delete tokens" });
			}

			const data = await event.request.formData();
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
