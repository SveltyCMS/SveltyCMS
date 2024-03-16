// Import the necessary modules.
import { getCollections } from '@src/collections';
import type { RequestHandler } from './$types';
import { auth, getCollectionModels } from '@src/routes/api/db';
import { validate } from '@src/utils/utils';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';

// Define the PATCH request handler.
export const PATCH: RequestHandler = async ({ params, request, cookies }) => {
	console.log('params:', params, 'request:', request, 'cookies:', cookies);
	// Get the session cookie.
	const session = cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;

	// Validate the session.
	const user = await validate(auth, session);

	// Check if the user has write access to the collection.
	const has_write_access = (await getCollections()).find((c: any) => c.name == params.collection)?.permissions?.[user.user.role]?.write ?? true;
	if (user.status != 200 || !has_write_access) {
		return new Response('', { status: 403 });
	}

	// Get the collection model.
	const collections = await getCollectionModels();
	const collection = collections[params.collection];

	// Get the form data.
	const data = await request.formData();

	// Get the ids of the entries to update.
	let ids = data.get('ids') as string;
	ids = JSON.parse(ids);

	// Get the new status.
	const status = data.get('status') as string;

	// Update the entries.
	return new Response(
		JSON.stringify(
			await collection.updateMany(
				{
					_id: {
						$in: ids
					}
				},
				{ status }
			)
		)
	);
};
