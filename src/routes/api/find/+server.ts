import type { RequestHandler } from './$types';
import { collectionsModels } from '@src/routes/api/db';

// Define GET request handler
export const GET: RequestHandler = async ({ url }) => {
	// Get collection and id from URL search parameters
	const collection = collectionsModels[url.searchParams.get('collection') as string];
	const id = url.searchParams.get('id') as string | null;

	// If id is provided, find document by id and return response
	if (id) {
		const resp = JSON.stringify(await collection.findById(url.searchParams.get('id') as string));
		return new Response(resp);
	} else {
		// Otherwise, parse query from URL search parameters, find documents matching query, and return response
		const query = JSON.parse(url.searchParams.get('query') as string);
		const resp = JSON.stringify(await collection.find(query));
		return new Response(resp);
	}
};
