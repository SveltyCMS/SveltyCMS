import type { RequestHandler } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

// Auth
import { auth } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Import logger
import logger from '@src/utils/logger';

// Import saveAvatarImage from utils/media
import { saveAvatarImage } from '@src/utils/media';

export const POST: RequestHandler = async (event) => {
	try {
		const { request, cookies } = event;
		const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

		if (!auth) {
			logger.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const user = await auth.validateSession({ session_id });

		if (!user) {
			logger.warn(`Unauthorized avatar save attempt by session: ${session_id}`);
			return new Response(JSON.stringify({ message: "You don't have permission to save avatar" }), { status: 403 });
		}

		const data = await request.formData();
		const avatarFile = data.get('avatar') as File;

		if (!avatarFile) {
			logger.warn('No avatar file provided in the request');
			return new Response(JSON.stringify({ message: 'No avatar file provided' }), { status: 400 });
		}

		const avatarUrl = await saveAvatarImage(avatarFile, 'avatars');
		await auth.updateUserAttributes(user.id, { avatar: avatarUrl });

		logger.info(`Avatar saved successfully for user ID: ${user.id}`);
		return new Response(JSON.stringify({ success: true, url: avatarUrl }), { status: 200 });
	} catch (error) {
		const err = error as Error;
		logger.error(`Failed to save avatar: ${err.message}`);
		return new Response(JSON.stringify({ message: 'Failed to save avatar' }), { status: 500 });
	}
};
