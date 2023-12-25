import fs from 'fs/promises';
import path from 'path';
import { PUBLIC_MEDIA_FOLDER } from '$env/static/public';
import { validate } from '@utils/utils';
import { auth } from '@api/db';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';
import { redirect } from '@sveltejs/kit';

export async function load(event: any) {
	// Secure this page with session cookie
	const session = event.cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
	// Validate the user's session
	const user = await validate(auth, session);
	// If validation fails, redirect the user to the login page
	if (user.status !== 200) {
		redirect(302, `/login`);
	}

	try {
		const imageName = decodeURIComponent(event.params.file.join('/')); // Decode the URI component
		const filePath = path.join(PUBLIC_MEDIA_FOLDER, imageName);
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
