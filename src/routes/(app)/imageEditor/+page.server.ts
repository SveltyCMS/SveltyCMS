import fs from 'fs/promises';
import path from 'path';
import { publicEnv } from '@root/config/public';
import { redirect } from '@sveltejs/kit';

// Auth
import { auth } from '@src/routes/api/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

export async function load(event: any) {
	// Secure this page with session cookie
	const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
	// Validate the user's session
	const user = await auth.validateSession(session_id);
	console.log('user: ', user);
	// If validation fails, redirect the user to the login page
	if (!user) {
		redirect(302, `/login`);
	}

	try {
		const imageName = decodeURIComponent(event.params.file.join('/')); // Decode the URI component
		const filePath = path.join(publicEnv.MEDIA_FOLDER, imageName);
		const fileStats = await fs.stat(filePath);

		if (fileStats.isFile()) {
			// await resizeImage(filePath);

			const imageData = {
				name: imageName,
				path: filePath
			};

			return {
				props: {
					imageData
				}
			};
		} else {
			throw new Error('File not found');
		}
	} catch (error) {
		return {
			status: 404
		};
	}
}
