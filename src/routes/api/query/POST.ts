import mongoose from 'mongoose';

import type { Schema } from '@src/collections/types';
import type { User } from '@src/auth/types';

import { getCollectionModels } from '../databases/db';
import { modifyRequest } from './modifyRequest';
import logger from '@utils/logger'; // Import logger

// Function to handle POST requests for a specified collection
export const _POST = async ({ data, schema, user }: { data: FormData; schema: Schema; user: User }) => {
	try {
		logger.debug(`POST request received for schema: ${schema.name}, userId: ${user.user_id}`);

		const body: { [key: string]: any } = {};
		const collections = await getCollectionModels(); // Get collection models from the database
		logger.debug(`Collection models retrieved: ${Object.keys(collections).join(', ')}`);

		const collection = collections[schema.name as string]; // Get the specific collection based on the schema name
		const fileIDS: string[] = [];

		// Check if the collection exists
		if (!collection) {
			logger.error(`Collection not found for schema: ${schema.name}`);
			return new Response('Collection not found!', { status: 404 });
		}

		// Parse the form data and build the body object
		for (const key of data.keys()) {
			try {
				body[key] = JSON.parse(data.get(key) as string, (key, value) => {
					if (value?.instanceof === 'File') {
						fileIDS.push(value.id);
						const file = data.get(value.id) as File;
						return file;
					}
					return value;
				});
			} catch (e) {
				body[key] = data.get(key) as string;
			}
		}
		logger.debug(`Form data parsed: ${JSON.stringify(body)}`);

		// Handle removal of files
		for (const id of fileIDS) {
			delete body[id];
		}

		// Set the status to 'PUBLISHED' and assign a new ObjectId
		body['status'] = 'PUBLISHED';
		body._id = new mongoose.Types.ObjectId();
		logger.debug(`Document prepared for insertion: ${JSON.stringify(body)}`);

		// Modify request with the updated body
		await modifyRequest({ data: [body], fields: schema.fields, collection, user, type: 'POST' });
		logger.debug(`Request modified: ${JSON.stringify(body)}`);

		// Insert the new document into the collection
		const result = await collection.insertMany(body);
		logger.debug(`Document inserted: ${JSON.stringify(result)}`);

		// Return the result as a JSON response
		return new Response(JSON.stringify(result), { status: 201 }); // 201 Created
	} catch (error) {
		// Handle error by checking its type
		if (error instanceof Error) {
			logger.error(`Error occurred during POST request: ${error.message}`);
			return new Response(error.message, { status: 500 });
		} else {
			logger.error('Unknown error occurred during POST request');
			return new Response('Unknown error occurred', { status: 500 });
		}
	}
};
