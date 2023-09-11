import fs from 'fs/promises';
import path from 'path';
import { PUBLIC_MEDIA_FOLDER } from '$env/static/public';
import { validate } from '@src/utils/utils';
import { auth } from '../../api/db';
import { SESSION_COOKIE_NAME } from 'lucia-auth';
import { redirect } from '@sveltejs/kit';

// Define the function to load image data
// async function loadImageData(imageName: string): Promise<{
// 	async function loadImageData(imageName: string): Promise<{
// 		name: string;
// 		path: string;
// 	}> {
// 		const filePath = path.join(PUBLIC_MEDIA_FOLDER, imageName);

// 		try {
// 			const fileStats = await fs.stat(filePath);
// 			if (fileStats.isFile()) {
// 				return {
// 					name: imageName,
// 					path: filePath
// 				};
// 			} else {
// 				throw new Error('File not found');
// 			}
// 		} catch (error) {
// 			throw new Error('Error loading image data');
// 		}
// 	}

export async function load(event: any) {
	// Secure this page with session cookie
	const session = event.cookies.get(SESSION_COOKIE_NAME) as string;
	// Validate the user's session
	const user = await validate(auth, session);
	// If validation fails, redirect the user to the login page
	if (user.status !== 200) {
		throw redirect(302, `/login`);
	}

	const { params } = event;
	const imageName = params.name;

	try {
		// const imageData = await loadImageData(imageName);
		// return {
		// 	props: {
		// 		imageData
		// 	}
		// };
	} catch (error) {
		return {
			status: 404,
			error
		};
	}
}
