import mongoose from 'mongoose';

import type { Schema } from '@src/collections/types';
import type { User } from '@src/auth/types';

import { getCollectionModels } from '../databases/db';
import { modifyRequest } from './modifyRequest';

// Function to handle DELETE requests for a specified collection
export const _DELETE = async ({ data, schema, user }: { data: FormData; schema: Schema; user: User }) => {
	try {
		const collections = await getCollectionModels(); // Get collection models from the database
		const collection = collections[schema.name as string]; // Get the specific collection based on the schema name

		// Parse the IDs from the form data
		let ids = data.get('ids') as string;
		ids = JSON.parse(ids);

		// Modify request for each ID
		for (const id of ids) {
			await modifyRequest({
				collection,
				data: [{ _id: new mongoose.Types.ObjectId(id) }],
				user,
				fields: schema.fields,
				type: 'DELETE'
			});
		}

		// Delete the documents with the specified IDs
		const result = await collection.deleteMany({
			_id: { $in: ids }
		});

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
