import type { RequestHandler } from './$types';
import { getCollectionModels } from '@src/routes/api/db';

// Export an asynchronous function named PATCH that is a RequestHandler
export const PATCH: RequestHandler = async ({ params, request }) => {
	// Retrieve the collection models from a database
	const collections = await getCollectionModels();
	// Identify the specific collection based on the params.collection value from the request
	const collection = collections[params.collection];
	// Read the form data from the request
	const data = await request.formData();
	// Retrieve the 'ids' field from the form data and parse it as a JSON string
	let ids = data.get('ids') as string;
	ids = JSON.parse(ids);
	// Retrieve the 'status' field from the form data
	const status = data.get('status') as string;
	// Log the ids for debugging purposes
	// console.log(ids);
	// console.log(typeof ids);
	// Update the documents in the collection with the given ids to the given status, and return the result as a response
	return new Response(
		JSON.stringify(
			await collection.updateMany(
				{
					_id: {
						$in: ids
					}
				},
				{ status }
			)
		)
	);
};
