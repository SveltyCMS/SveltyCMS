import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { auth } from '@api/databases/db'; // Import the auth instance
import { SESSION_COOKIE_NAME } from '@src/auth'; // Import the session cookie name
import logger from '@src/utils/logger'; // Import logger

// Mocked function to delete image model
async function deleteImageModel(hash: string) {
	// Replace this with actual database logic to delete an image by hash
}

export const DELETE: RequestHandler = async (event) => {
	try {
		const { request, cookies } = event;
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const user = await auth.validateSession({ session_id });

		if (!user) {
			logger.warn(`Unauthorized avatar delete attempt by session: ${session_id}`);
			return new Response(JSON.stringify({ message: "You don't have permission to delete avatar" }), { status: 403 });
		}

		const { hash } = await request.json();

		await deleteImageModel(hash);
		await auth.updateUserAttributes(user.id, { avatar: null });

		logger.info(`Avatar deleted successfully for user ID: ${user.id}`);
		return new Response(JSON.stringify({ success: true }), { status: 200 });
	} catch (error) {
		const err = error as Error;
		logger.error(`Failed to delete avatar: ${err.message}`);
		return new Response(JSON.stringify({ message: 'Failed to delete avatar' }), { status: 500 });
	}
};
