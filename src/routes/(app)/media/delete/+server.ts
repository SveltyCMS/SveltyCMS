import { auth } from '@api/databases/db';
import type { RequestHandler } from './$types';

import mongoose from 'mongoose';
import { SESSION_COOKIE_NAME } from '@src/auth';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
	const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));
	if (!user || user.role != 'admin') {
		return new Response('You dont have an access', { status: 403 });
	}
	const formData = await request.formData();
	const id = formData.get('id') as string;

	await mongoose.models['media_images'].deleteOne({ _id: new mongoose.Types.ObjectId(id) });
	return new Response('has been successfully deleted', { status: 200 });
};
