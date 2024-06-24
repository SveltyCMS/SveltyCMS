import fs from 'fs';
import type { RequestHandler } from '@sveltejs/kit';
import { _GET } from '../query/GET';
import { getFieldName } from '@src/utils/utils';

// Auth
import { auth } from '../databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Stores
import { collections } from '@src/stores/store';
import { get } from 'svelte/store';

// Components
import widgets from '@src/components/widgets';

// Define the GET request handler
export const GET: RequestHandler = async ({ cookies }) => {
	// Create the indexes directory if it doesn't exist
	fs.mkdirSync('./indexes', { recursive: true });

	// Retrieve the session ID from cookies
	const sessionId = cookies.get(SESSION_COOKIE_NAME) as string;

	// Check if the authentication system is initialized
	if (!auth) {
		console.error('Authentication system is not initialized');
		return new Response('Internal Server Error', { status: 500 });
	}

	// Validate the session
	const user = await auth.validateSession({ sessionId });

	// Check if the user is authenticated and has admin role
	if (!user || user.role != 'admin') {
		return new Response('', { status: 403 });
	}

	// Retrieve collections from the store
	const $collections = get(collections);

	// Iterate over each collection to create index files
	for (const collection of Object.values($collections)) {
		let text = '';

		// Fetch entry list for the collection
		const entryList = (
			await (
				await _GET({
					schema: collection,
					user
				})
			).json()
		).entryList;

		// Iterate over each entry in the entry list
		for (const entry of entryList) {
			let entry_text = '';

			// Iterate over each field in the collection
			for (const field of collection.fields) {
				const widget = widgets[field.widget.Name];
				const fieldName = getFieldName(field);

				// Check if the widget has a toString method
				if ('toString' in widget) {
					entry_text += widget.toString({ field, data: entry[fieldName] }) + '\n';
				}
			}

			// Trim and format the entry text
			entry_text = entry_text.trim();
			if (entry_text) {
				text += `\n\n_id:${entry._id.toString()}\n`;
				text += entry_text;
			}
		}

		// Write the formatted text to a file
		if (text) {
			fs.writeFileSync('./indexes/' + collection.name + '.txt', text);
		}
	}

	// Return a success response
	return new Response('', { status: 200 });
};
