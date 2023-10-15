import fs from 'fs/promises';
import path from 'path';
import { PUBLIC_MEDIA_FOLDER } from '$env/static/public';
import { validate } from '@src/utils/utils';
import { auth } from '../../api/db';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';
import { redirect } from '@sveltejs/kit';

import sharp from 'sharp';

// resize image preview
async function resizeImage(imagePath) {
	const outputBuffer = await sharp(imagePath)
		.resize(800, 800, {
			fit: 'inside',
			withoutEnlargement: true
		})
		.toBuffer();

	await fs.writeFile(imagePath, outputBuffer);
}

// Define the function to load image data
// async function loadImageData(imageName: string): Promise<{
// 	name: string;
// 	path: string;
// }> {
// 	const filePath = path.join(PUBLIC_MEDIA_FOLDER, imageName);

// 	try {
// 		const fileStats = await fs.stat(filePath);
// 		if (fileStats.isFile()) {
// 			return {
// 				name: imageName,
// 				path: filePath
// 			};
// 		} else {
// 			throw new Error('File not found');
// 		}
// 	} catch (error) {
// 		throw new Error('Error loading image data');
// 	}
// }

export async function load(event: any) {
	// Secure this page with session cookie
	const session = event.cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
	// Validate the user's session
	const user = await validate(auth, session);
	// If validation fails, redirect the user to the login page
	if (user.status !== 200) {
		throw redirect(302, `/login`);
	}

	try {
		const imageName = decodeURIComponent(event.params.file.join('/')); // Decode the URI component
		const filePath = path.join(PUBLIC_MEDIA_FOLDER, imageName);
		const fileStats = await fs.stat(filePath);

		if (fileStats.isFile()) {
			await resizeImage(filePath);

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
