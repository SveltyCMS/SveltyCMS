import mongoose from 'mongoose';

import { getCollectionModels } from '../databases/db';
import { modifyRequest } from './modifyRequest';

import type { User } from '@src/auth/types';
import type { Schema } from '@src/collections/types';

// Function to handle PATCH requests for a specified collection
export const _PATCH = async ({ data, schema, user }: { data: FormData; schema: Schema; user: User }) => {
	try {
		const body: { [key: string]: any } = {};
		const collections = await getCollectionModels(); // Get collection models from the database
		const collection = collections[schema.name as string]; // Get the specific collection based on the schema name
		const _id = data.get('_id') as string; // Get the document ID from the form data

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

		// Handle removal of storage images
		if (body?._meta_data?.storage_images?.removed) {
			await mongoose.models['_storage_images'].updateMany(
				{ _id: { $in: body?._meta_data?.storage_images?.removed } },
				{ $pull: { used_by: new mongoose.Types.ObjectId(_id) } }
			);
		}

		// Modify request with the updated body
		await modifyRequest({ data: [body], fields: schema.fields, collection, user, type: 'PATCH' });

		// Update the document in the collection
		const result = await collection.updateOne({ _id: new mongoose.Types.ObjectId(_id) }, { $set: body });

		// Return the result as a JSON response
		return new Response(JSON.stringify(result));
	} catch (error) {
		// Handle error by checking its type
		if (error instanceof Error) {
			return new Response(error.message, { status: 500 });
		} else {
			return new Response('Unknown error occurred', { status: 500 });
		}
	}
};
