import type { RequestHandler } from './$types';
import { getCollectionModels } from '@src/routes/api/db';

// Export an asynchronous function named POST that is a RequestHandler
export const POST: RequestHandler = async ({ params, request }) => {
	// Retrieve the collection models from the database
	const collections = await getCollectionModels();
	// Identify the specific collection based on the params.collection value from the request
	const collection = collections[params.collection];
	// Read the form data from the request
	const data = await request.formData();
	// Retrieve the '_id' field from the form data
	const _id = data.get('_id') as string;
	// Retrieve the 'userID' field from the form data
	const userID = data.get('userID') as string;
	// Retrieve the 'isAdmin' field from the form data
	const isAdmin = data.get('isAdmin') === 'true'; // Assuming it's a string representation of a boolean

	// Check if the document is already locked by another user
	const existingLock = await collection.findOne({ _id, lockedBy: { $exists: true } });

	// Check if the user is an admin and can break the lock
	if (existingLock && existingLock.lockedBy !== userID && !isAdmin) {
		return new Response(JSON.stringify({ error: 'Document is already locked by another user.' }), { status: 400 });
	}

	// Update the document in the collection with the lock information
	const result = await collection.updateOne(
		{ _id },
		{
			$set: {
				lockedBy: userID,
				lockedAt: Date.now()
			}
		}
	);

	return new Response(JSON.stringify(result));
};
