import { auth, dbAdapter } from '@src/databases/db';
import type { RequestHandler } from './$types';
import { SESSION_COOKIE_NAME } from '@src/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

	if (!session_id) {
		return new Response('Session ID is missing', { status: 403 });
	}

	if (!auth || !dbAdapter) {
		console.error('Authentication system or database adapter is not initialized');
		return new Response('Internal Server Error', { status: 500 });
	}

	// Validate the user's session
	const user = await auth.validateSession({ session_id });
	if (!user || user.role !== 'admin') {
		return new Response("You don't have access", { status: 403 });
	}

	const formData = await request.formData();
	const id = formData.get('id') as string;

	try {
		await dbAdapter.deleteOne('media_images', { _id: id });
		return new Response('Media image has been successfully deleted', { status: 200 });
	} catch (err) {
		console.error('Error deleting media image:', err);
		return new Response('Error deleting media image', { status: 500 });
	}
};
