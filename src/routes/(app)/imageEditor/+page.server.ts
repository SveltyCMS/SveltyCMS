import fs from 'fs/promises';
import path from 'path';
import { publicEnv } from '@root/config/public';
import { redirect, error } from '@sveltejs/kit';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

export async function load(event: any) {
	if (!auth) {
		console.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Secure this page with session cookie
	let sessionId = event.cookies.get(SESSION_COOKIE_NAME) as string;

	// If no session ID is found, create a new session
	if (!sessionId) {
		// console.log('Session ID is missing from cookies, creating a new session.');
		try {
			const newSession = await auth.createSession({ userId: 'guestUserId' });
			const sessionCookie = auth.createSessionCookie(newSession);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			sessionId = sessionCookie.value;
			// console.log('New session created:', sessionId);
		} catch (e) {
			console.error('Failed to create a new session:', e);
			throw error(500, 'Internal Server Error');
		}
	}

	// Check if `auth` is initialized
	if (!auth) {
		console.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Validate the user's session
	const user = await auth.validateSession({ sessionId });

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
				imageData,
				user // return the user data if needed
			};
		} else {
			throw new Error('File not found');
		}
	} catch (err) {
		console.error('Error loading file:', err);
		return {
			status: 404,
			error: 'File not found'
		};
	}
}
