import { publicEnv } from '@root/config/public';
import mongoose from 'mongoose';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import type { User } from '@src/auth/types';

import { getCollections } from '@src/collections';
import type { Schema } from '@src/collections/types';
import { _GET } from './GET';
import { _POST } from './POST';
import { _PATCH } from './PATCH';
import { _DELETE } from './DELETE';
import { _SETSTATUS } from './SETSTATUS';

// Helper function to check user permissions
async function checkUserPermissions(data: FormData, cookies: any) {
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
	const user_id = data.get('user_id') as string;

	const user = user_id
		? ((await auth.checkUser({ _id: user_id })) as User)
		: ((await auth.validateSession(new mongoose.Types.ObjectId(session_id))) as User);

	if (!user) {
		throw new Error('Unauthorized');
	}

	const collectionName = data.get('collectionName') as string;
	const collection_schema = (await getCollections())[collectionName] as Schema;

	if (!collection_schema) {
		throw new Error('Collection not found');
	}

	const has_read_access = collection_schema?.permissions?.[user.role]?.read !== false;
	const has_write_access = collection_schema?.permissions?.[user.role]?.write !== false;

	return { user, collection_schema, has_read_access, has_write_access };
}

// Main POST handler
export const POST = async ({ request, cookies }) => {
	const data = await request.formData();
	const method = data.get('method') as string;

	['user_id', 'collectionName', 'method'].forEach((key) => data.delete(key));

	try {
		const { user, collection_schema, has_read_access, has_write_access } = await checkUserPermissions(data, cookies);

		if (!has_read_access) {
			return new Response('Forbidden', { status: 403 });
		}

		const page = parseInt(data.get('page') as string) || 1;
		const limit = parseInt(data.get('limit') as string) || 0;
		const filter: { [key: string]: string } = JSON.parse(data.get('filter') as string) || {};
		const sort: { [key: string]: number } = JSON.parse(data.get('sort') as string) || {};
		const contentLanguage = (data.get('contentLanguage') as string) || publicEnv.DEFAULT_CONTENT_LANGUAGE;

		switch (method) {
			case 'GET':
				return _GET({
					contentLanguage,
					filter,
					schema: collection_schema,
					sort,
					user,
					limit,
					page
				});
			case 'POST':
			case 'PATCH':
			case 'DELETE':
			case 'SETSTATUS': {
				if (!has_write_access) {
					return new Response('Forbidden', { status: 403 });
				}
				const handler = {
					POST: _POST,
					PATCH: _PATCH,
					DELETE: _DELETE,
					SETSTATUS: _SETSTATUS
				}[method];

				return handler({
					data,
					schema: collection_schema,
					user
				});
			}
			default:
				return new Response('Method not allowed', { status: 405 });
		}
	} catch (error) {
		// Handle error by checking its type
		if (error instanceof Error) {
			return new Response(error.message, { status: 403 });
		} else {
			return new Response('Unknown error occurred', { status: 500 });
		}
	}
};
