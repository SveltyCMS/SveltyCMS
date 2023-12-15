import type { RequestHandler } from './$types';
import { getCollectionModels } from '@api/db';

// Export an asynchronous function named PATCH that is a RequestHandler
export const PATCH: RequestHandler = async ({ params, request }) => {
	try {
		// Retrieve the collection models from a database
		const collections = await getCollectionModels();
		// Identify the specific collection based on the params.collection value from the request
		const collection = collections[params.collection];

		// Check if the collection exists
		if (!collection) {
			return new Response('Collection not found!!', { status: 404 });
		}

		// Read the form data from the request
		const data = await request.formData();
		// Retrieve the 'ids' field from the form data and parse it as a JSON string
		let ids = data.get('ids') as string;

		// Check if 'ids' field is provided
		if (!ids) {
			return new Response('No ids provided in the request', { status: 400 });
		}

		ids = JSON.parse(ids);
		// Retrieve the 'status' field from the form data
		const status = data.get('status') as string;

		// Check if 'status' field is provided
		if (!status) {
			return new Response('No status provided in the request', { status: 400 });
		}

		// Update the documents in the collection with the given ids to the given status
		const result = await collection.updateMany(
			{
				_id: {
					$in: ids
				}
			},
			{ status }
		);

		// Return the result as a response
		return new Response(JSON.stringify(result));
	} catch (error) {
		// Handle unexpected errors
		console.error('An error occurred:', error);
		return new Response('Internal Server Error', { status: 500 });
	}
};
