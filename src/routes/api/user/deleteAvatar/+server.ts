import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { auth } from '@api/databases/db'; // Import the auth instance
import { SESSION_COOKIE_NAME } from '@src/auth'; // Import the session cookie name

// Import logger
import {logger} from '@src/utils/logger';

// Mocked function to delete image model
async function deleteImageModel(hash: string) {
	// Replace this with actual database logic to delete an image by hash
	logger.info(`Deleting image with hash: ${hash}`);
	// Example placeholder for actual deletion logic
	return true;
}

export const DELETE: RequestHandler = async (event) => {
	try {
		const { request, cookies } = event;
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

		// Check if the authentication system is initialized
		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		// Validate the session
		const user = await auth.validateSession({ session_id });

		// Check if the user is authenticated
		if (!user) {
			logger.warn(`Unauthorized avatar delete attempt by session: ${session_id}`);
			return new Response(JSON.stringify({ message: "You don't have permission to delete avatar" }), { status: 403 });
		}

		// Parse the request body to get the hash
		const { hash } = await request.json();

		// Ensure the hash is used in the deleteImageModel function
		await deleteImageModel(hash);

		// Update the user's avatar to undefined
		await auth.updateUserAttributes(user.id, { avatar: undefined });

		logger.info(`Avatar deleted successfully for user ID: ${user.id}`);
		return new Response(JSON.stringify({ success: true }), { status: 200 });
	} catch (err) {
		// Handle error by checking its type
		logger.error(`Failed to delete avatar: ${(err as Error).message}`);
		return new Response(JSON.stringify({ message: 'Failed to delete avatar' }), { status: 500 });
	}
};
