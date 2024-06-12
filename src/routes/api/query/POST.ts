import mongoose from 'mongoose';

import type { Schema } from '@src/collections/types';
import type { User } from '@src/auth/types';

import { getCollectionModels } from '../databases/db';
import { modifyRequest } from './modifyRequest';

// Function to handle POST requests for a specified collection
export const _POST = async ({ data, schema, user }: { data: FormData; schema: Schema; user: User }) => {
	try {
		const body: { [key: string]: any } = {};
		const collections = await getCollectionModels(); // Get collection models from the database
		const collection = collections[schema.name as string]; // Get the specific collection based on the schema name

		// Check if the collection exists
		if (!collection) return new Response('Collection not found!', { status: 404 });

		// Parse the form data and build the body object
		for (const key of data.keys()) {
			try {
				body[key] = JSON.parse(data.get(key) as string, (key, value) => {
					if (value?.instanceof === 'File') {
						const file = data.get(value.id) as File;
						data.delete(value.id);
						return file;
					}
					return value;
				});
			} catch (e) {
				body[key] = data.get(key) as string;
			}
		}

		// Set the status to 'PUBLISHED' and assign a new ObjectId
		body['status'] = 'PUBLISHED';
		body._id = new mongoose.Types.ObjectId();

		// Modify request with the updated body
		await modifyRequest({ data: [body], fields: schema.fields, collection, user, type: 'POST' });

		// Insert the new document into the collection
		const result = await collection.insertMany(body);

		// Return the result as a JSON response
		return new Response(JSON.stringify(result), { status: 201 }); // 201 Created
	} catch (error) {
		// Handle error by checking its type
		if (error instanceof Error) {
			return new Response(error.message, { status: 500 });
		} else {
			return new Response('Unknown error occurred', { status: 500 });
		}
	}
};
