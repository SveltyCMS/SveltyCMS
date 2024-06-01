import fs from 'fs/promises';
import path from 'path';
import { publicEnv } from '@root/config/public';
import { redirect } from '@sveltejs/kit';
// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import mongoose from 'mongoose';

export async function load(event: any) {
	// Secure this page with session cookie
	const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;

	if (!session_id) {
		throw redirect(302, `/login`);
	}

	// Validate the user's session
	const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

	if (!user) {
		throw redirect(302, `/login`);
	}

	try {
		const imageName = decodeURIComponent(event.params.file.join('/')); // Decode the URI component
		const filePath = path.join(publicEnv.MEDIA_FOLDER, imageName);
		const fileStats = await fs.stat(filePath);

		if (fileStats.isFile()) {
			// const imagePath = await resizeImage(filePath);
			const imageData = {
				name: imageName,
				path: filePath
			};

			return {
				imageData
			};
		} else {
			throw new Error('File not found');
		}
	} catch (error) {
		return {
			status: 404,
			error: 'File not found'
		};
	}
}
