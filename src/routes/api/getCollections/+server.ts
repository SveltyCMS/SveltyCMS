import type { RequestHandler } from '@sveltejs/kit';
import { getCollectionFiles } from './getCollectionFiles';

// System Logs
import logger from '@src/utils/logger';

// Define the GET request handler
export const GET: RequestHandler = async () => {
	try {
		// Retrieve the collection files using the getCollectionFiles function
		const files = getCollectionFiles();
		logger.info('Collection files retrieved successfully');

		// Return the collection files as a JSON response
		return new Response(JSON.stringify(files));
	} catch (error) {
		logger.error('Error retrieving collection files', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};
