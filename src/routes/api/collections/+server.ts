/**
 * @file src/routes/api/collections/+server.ts
 * @description This file defines the GET request handler for the `/api/collections` endpoint.
 * The handler retrieves the list of collections from the ContentManager and returns them as a JSON response.
 * If an error occurs during the loading process, it logs the error and returns a 500 status code with an error message.
 */

import { json } from '@sveltejs/kit';
import { contentManager } from '@src/content/ContentManager';

export const GET = async () => {
	try {
		const collections = await contentManager.loadCollections();
		return json(collections);
	} catch (error) {
		console.error('Error loading collections:', error);
		return new Response(JSON.stringify({ error: 'Failed to load collections' }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
};
