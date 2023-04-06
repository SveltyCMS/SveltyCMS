// Import dependencies
import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs';

// Define a function to handle HTTP POST requests
export const GET: RequestHandler = async ({ url }) => {
	// Extract form data from the request body

	const dataUrl = url.toString();
	const parts = dataUrl.split('avatar/');
	// base folder for saving user medias
	const basePath = 'assets/media/avatar';
	const avatarFileUrl = basePath + '/' + parts[1];

	// Check if the media folder exists and create it if it doesn't
	if (!fs.existsSync(basePath)) {
		fs.mkdirSync(basePath, { recursive: true });
	}

	try {
		const avatar = fs.readFileSync(avatarFileUrl);
		return new Response(avatar, {
			status: 200
		});
	} catch (e) {
		return new Response(null, { statusText: 'Avatar ' + parts[1] + 'not found', status: 404 });
	}
};
