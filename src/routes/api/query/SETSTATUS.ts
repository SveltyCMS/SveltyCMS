import type { Schema } from '@src/collections/types';
import { dbAdapter, getCollectionModels } from '@api/databases/db';

// Import logger
import logger from '@utils/logger';

// Function to handle SETSTATUS requests for a specified collection
export const _SETSTATUS = async ({ data, schema }: { data: FormData; schema: Schema }) => {
	try {
		logger.debug(`SETSTATUS request received for schema: ${schema.name}`);

		if (!dbAdapter) {
			logger.error('Database adapter is not initialized.');
			return new Response('Internal server error: Database adapter not initialized', { status: 500 });
		}

		const collections = await getCollectionModels(); // Get collection models from the database
		const collection = collections[schema.name as string]; // Get the specific collection based on the schema name

		// Check if the collection exists
		if (!collection) {
			logger.error(`Collection not found for schema: ${schema.name}`);
			return new Response('Collection not found!', { status: 404 });
		}

		// Parse the IDs and status from the form data
		const ids = JSON.parse(data.get('ids') as string);
		const status = data.get('status') as string;

		logger.debug(`Updating status to '${status}' for IDs: ${ids.join(', ')}`);

		// Update the status of the documents with the specified IDs
		const result = await dbAdapter.updateMany(schema.name, { _id: { $in: ids } }, { $set: { status } });
		logger.debug(`Status updated: ${JSON.stringify(result)}`);

		// Return the result as a JSON response
		return new Response(JSON.stringify(result));
	} catch (error) {
		// Handle error by checking its type
		const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
		logger.error(`Error occurred during SETSTATUS request: ${errorMessage}`);
		return new Response(errorMessage, { status: 500 });
	}
};
