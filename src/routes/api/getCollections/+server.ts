import type { RequestHandler } from '@sveltejs/kit';
import { getCollectionFiles } from './getCollectionFiles';

// Define the GET request handler
export const GET: RequestHandler = async () => {
	// Retrieve the collection files using the getCollectionFiles function
	const files = getCollectionFiles();

	// Return the collection files as a JSON response
	return new Response(JSON.stringify(files));
};
