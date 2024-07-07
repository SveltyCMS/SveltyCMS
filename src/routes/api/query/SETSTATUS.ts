import type { Schema } from '@src/collections/types';
import mongoose from 'mongoose';
import { getCollectionModels } from '../databases/db';

// Import logger
import logger from '@utils/logger';

// Function to handle SETSTATUS requests for a specified collection
export const _SETSTATUS = async ({ data, schema }: { data: FormData; schema: Schema }) => {
	try {
		logger.debug(`SETSTATUS request received for schema: ${schema.name}`);

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
		const result = await collection.updateMany(
			{
				_id: { $in: ids.map((id: string) => new mongoose.Types.ObjectId(id)) }
			},
			{ $set: { status } }
		);
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
