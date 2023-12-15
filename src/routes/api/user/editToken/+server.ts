import mongoose from 'mongoose';
import type { RequestHandler } from './$types';
import { auth } from '@api/db';

export const POST: RequestHandler = async ({ request }) => {
	const data = await request.json();
	const AUTH_USER = mongoose.models['auth_user'];
	let adminLength = (await AUTH_USER.find({ role: 'admin' })).length;

	const user = await auth.getUser(data.userId);
	if (!user) return new Response(JSON.stringify('User not found'), { status: 404 });
	if (adminLength == 1 && data.role != 'admin' && (user as any).role == 'admin')
		return new Response(JSON.stringify('Cannot delete all admins'), { status: 400 });
	adminLength -= (user as any).role == 'admin' && data.role != 'admin' ? 1 : 0;

	auth.updateUserAttributes(data.userId, {
		role: data.role
	});

	return new Response(JSON.stringify('Success'), { status: 200 });
};
