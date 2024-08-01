import type { RequestHandler } from './$types';
import { collectionsModels } from '@src/databases/db';

// System Logs
import logger from '@src/utils/logger';

// Define GET request handler
export const GET: RequestHandler = async ({ url }) => {
	// Get collection and id from URL search parameters
	const collectionName = url.searchParams.get('collection') as string;
	const collection = collectionsModels[collectionName];
	const id = url.searchParams.get('id') as string | null;

	logger.debug(`Collection requested: ${collectionName}`);
	logger.debug(`ID requested: ${id}`);

	if (!collection) {
		logger.error(`Collection not found: ${collectionName}`);
		return new Response('Collection not found', { status: 404 });
	}

	try {
		// If id is provided, find document by id and return response
		if (id) {
			const document = await collection.findById(id);
			const resp = JSON.stringify(document);
			logger.info(`Document found by ID: ${id}`);
			return new Response(resp);
		} else {
			// Otherwise, parse query from URL search parameters, find documents matching query, and return response
			const query = JSON.parse(url.searchParams.get('query') as string);
			const documents = await collection.find(query);
			const resp = JSON.stringify(documents);
			logger.info(`Documents found by query: ${JSON.stringify(query)}`);
			return new Response(resp);
		}
	} catch (error) {
		logger.error('Error fetching documents', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};
