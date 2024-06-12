import fs from 'fs';
import type { RequestHandler } from './$types';
import { publicEnv } from '@root/config/public';
import { _GET } from '@api/query/GET';
import mongoose from 'mongoose';

// Auth
import { auth } from '@api/databases/db';
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
	const $collections = get(collections);

	// Get the form data.
	const data: { [key: string]: any } = {};

	for (const collection of $collections) {
		const name = collection.name as string;
		data[name as string] = (
			await (
				await _GET({
					schema: collection,
					user
				})
			).json()
		).entryList;
	}
	if (publicEnv.EXTRACT_DATA_PATH) {
		fs.writeFileSync(publicEnv.EXTRACT_DATA_PATH, JSON.stringify(data).replaceAll('/media', 'media'));
		return new Response('', { status: 200 });
	} else {
		return new Response('EXTRACT_DATA_PATH not configured', { status: 500 });
	}
};
