import type { Schema } from '@src/collections/types';

import { getCollectionModels } from '../databases/db';

// Function to handle SETSTATUS requests for a specified collection
export const _SETSTATUS = async ({ data, schema }: { data: FormData; schema: Schema }) => {
	try {
		const collections = await getCollectionModels(); // Get collection models from the database
		const collection = collections[schema.name as string]; // Get the specific collection based on the schema name

		// Parse the IDs and status from the form data
		let ids = data.get('ids') as string;
		ids = JSON.parse(ids);
		const status = data.get('status') as string;

		// Check if the collection exists
		if (!collection) return new Response('Collection not found!!', { status: 404 });

		// Update the status of the documents with the specified IDs
		const result = await collection.updateMany(
			{
				_id: { $in: ids }
			},
			{ status }
		);

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
