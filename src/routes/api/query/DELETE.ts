import mongoose from 'mongoose';

import type { Schema } from '@src/collections/types';
import type { User } from '@src/auth/types';

import { getCollectionModels } from '../databases/db';
import { modifyRequest } from './modifyRequest';
import logger from '@utils/logger'; // Import logger

// Function to handle DELETE requests for a specified collection
export const _DELETE = async ({ data, schema, user }: { data: FormData; schema: Schema; user: User }) => {
	try {
		logger.debug(`DELETE request received for schema: ${schema.name}, userId: ${user.user_id}`);

		const collections = await getCollectionModels(); // Get collection models from the database
		logger.debug(`Collection models retrieved: ${Object.keys(collections).join(', ')}`);

		const collection = collections[schema.name as string]; // Get the specific collection based on the schema name

		// Check if the collection exists
		if (!collection) {
			logger.error(`Collection not found for schema: ${schema.name}`);
			return new Response('Collection not found!', { status: 404 });
		}

		// Parse the IDs from the form data
		const ids = data.get('ids') as string;
		const idsArray: string[] = JSON.parse(ids);
		logger.debug(`IDs to delete: ${idsArray.join(', ')}`);

		// Modify request for each ID
		for (const id of idsArray) {
			await modifyRequest({
				collection,
				data: [{ _id: new mongoose.Types.ObjectId(id) }],
				user,
				fields: schema.fields,
				type: 'DELETE'
			});
			logger.debug(`Request modified for ID: ${id}`);
		}

		// Delete the documents with the specified IDs
		const result = await collection.deleteMany({
			_id: { $in: idsArray }
		});
		logger.debug(`Documents deleted: ${JSON.stringify(result)}`);

		// Return the result as a JSON response
		return new Response(JSON.stringify(result));
	} catch (error) {
		// Handle error by checking its type
		if (error instanceof Error) {
			logger.error(`Error occurred during DELETE request: ${error.message}`);
			return new Response(error.message, { status: 500 });
		} else {
			logger.error('Unknown error occurred during DELETE request');
			return new Response('Unknown error occurred', { status: 500 });
		}
	}
};
