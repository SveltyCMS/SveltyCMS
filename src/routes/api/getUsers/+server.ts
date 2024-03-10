import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';
import type { RequestHandler } from './$types';
import { validate } from '@src/utils/utils';
import { auth } from '../db';
import mongoose from 'mongoose';

export const GET: RequestHandler = async ({ cookies }) => {
	const session = cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
	const user = await validate(auth, session);

	if (user.status != 200 || user.user.role != 'admin') {
		return new Response('', { status: 403 });
	}

	const docs = await mongoose.models['auth_user'].aggregate([
		{
			$lookup: {
				from: 'auth_keys',
				localField: '_id',
				foreignField: 'user_id',
				as: 'result'
			}
		},

		{ $unwind: '$result' },

		{
			$replaceRoot: {
				newRoot: { ID: '$result.user_id', provider: '$result._id', username: '$username', role: '$role', createdAt: '$createdAt' }
			}
		}
	]);

	const res = JSON.stringify(docs);
	return new Response(res, { status: 200 });
};
