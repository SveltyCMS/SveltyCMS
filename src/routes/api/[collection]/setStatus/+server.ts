import { getCollections } from '@src/collections';
import type { RequestHandler } from './$types';
import { getCollectionModels } from '@api/databases/db';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import mongoose from 'mongoose';

// Define the PATCH request handler.
export const PATCH: RequestHandler = async ({ params, request, cookies }) => {
	// Get the session cookie.
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

	// Validate the session.
	const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

	if (!user) {
		return new Response('', { status: 403 });
	}

	// Check if the user has write access to the collection.
	const has_write_access = (await getCollections()).find((c) => c.name == params.collection)?.permissions?.[user.role]?.write;
	if (!has_write_access) {
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
