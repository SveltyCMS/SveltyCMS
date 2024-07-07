import { publicEnv } from '@root/config/public';
import type { RequestHandler } from '@sveltejs/kit';

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
	// Retrieve the session ID from cookies
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
	// Retrieve the user ID from the form data
	const user_id = data.get('user_id') as string;

	if (!auth) {
		throw new Error('Auth is not initialized');
	}

	// Authenticate user based on user ID or session ID
	const user = user_id
		? ((await auth.checkUser({ user_id })) as User) // Check user with user ID
		: ((await auth.validateSession({ session_id })) as User); // Validate session with session ID

	if (!user) {
		throw new Error('Unauthorized');
	}

	// Retrieve the collection name from the form data
	const collectionName = data.get('collectionName') as string;
	// Get the schema for the specified collection
	const collection_schema = (await getCollections())[collectionName] as Schema;

	if (!collection_schema) {
		throw new Error('Collection not found');
	}

	// Check read and write permissions for the user
	const has_read_access = collection_schema?.permissions?.[user.role]?.read !== false;
	const has_write_access = collection_schema?.permissions?.[user.role]?.write !== false;

	return { user, collection_schema, has_read_access, has_write_access };
}

// Main POST handler
export const POST: RequestHandler = async ({ request, cookies }) => {
	// Retrieve data from the request form
	const data = await request.formData();
	// Retrieve the method from the form data
	const method = data.get('method') as string;

	// Delete these keys from the form data as they are no longer needed
	['user_id', 'collectionName', 'method'].forEach((key) => data.delete(key));

	try {
		// Check user permissions
		const { user, collection_schema, has_read_access, has_write_access } = await checkUserPermissions(data, cookies);

		// If user does not have read access, return 403 Forbidden response
		if (!has_read_access) {
			return new Response('Forbidden', { status: 403 });
		}

		// Parse pagination, filter, sort, and content language from the form data
		const page = parseInt(data.get('page') as string) || 1;
		const limit = parseInt(data.get('limit') as string) || 0;
		const filter: { [key: string]: string } = JSON.parse(data.get('filter') as string) || {};
		const sort: { [key: string]: number } = JSON.parse(data.get('sort') as string) || {};
		const contentLanguage = (data.get('contentLanguage') as string) || publicEnv.DEFAULT_CONTENT_LANGUAGE;

		// Handle different methods
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
				// If user does not have write access, return 403 Forbidden response
				if (!has_write_access) {
					return new Response('Forbidden', { status: 403 });
				}
				// Select the appropriate handler based on the method
				const handler = {
					POST: _POST,
					PATCH: _PATCH,
					DELETE: _DELETE,
					SETSTATUS: _SETSTATUS
				}[method];

				// Call the handler and return its response
				return handler({
					data,
					schema: collection_schema,
					user
				});
			}
			default:
				// If method is not allowed, return 405 Method Not Allowed response
				return new Response('Method not allowed', { status: 405 });
		}
	} catch (error) {
		// Handle error by checking its type
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		return new Response(errorMessage, { status: error instanceof Error ? 403 : 500 });
	}
};
