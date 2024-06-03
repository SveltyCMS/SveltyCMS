import fs from 'fs';
import type { RequestHandler } from './$types';

// Auth
import { auth, getCollectionModels } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Stores
import { collections } from '@src/stores/store';
import { get } from 'svelte/store';

export const GET: RequestHandler = async ({ cookies }) => {
	// Get the session cookie.
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

	// Validate the session.
	const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

	if (!user || user.role != 'admin') {
		return new Response('', { status: 403 });
	}

	// Get the collection model.
	const collectionsModels = await getCollectionModels();
	const $collections = get(collections);

	// Get the form data.
	const data = await request.formData();

	for (const collection of $collections) {
		const name = collection.name as string;
		data[name as string] = await collectionsModels[name as string].find({});
	}
	console.log(data);
	fs.writeFileSync(`${import.meta.env.root}/data.json`, JSON.stringify(data));

	return new Response('', { status: 200 });
};
