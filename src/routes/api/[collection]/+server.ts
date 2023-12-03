import type { RequestHandler } from './$types';
import { getCollectionModels } from '@src/routes/api/db';
import { parse, saveImages } from '@src/utils/utils';

// Export an asynchronous function named GET that is a RequestHandler
export const GET: RequestHandler = async ({ params, url }) => {
	// Retrieve the collection models from a database
	const collections = await getCollectionModels();
	// Get the page number from the URL query parameters, or default to 1 if it's not provided
	const page = parseInt(url.searchParams.get('page') as string) || 1;
	// Identify the specific collection based on the params.collection value from the request
	const collection = collections[params.collection];
	// Get the length (number of items per page) from the URL query parameters, or default to Infinity if it's not provided
	const length = parseInt(url.searchParams.get('length') as string) || Infinity;
	// Calculate the number of items to skip based on the current page number and length
	const skip = (page - 1) * length;

	// Use Promise.all to run the find and countDocuments operations in parallel for performance improvement
	const [entryList, totalCount] = await Promise.all([collection.find().skip(skip).limit(length), collection.countDocuments()]);

	// Return a response with the requested page of items from the collection and the total count of items in the collection
	return new Response(JSON.stringify({ entryList, totalCount }));
};

// Export an asynchronous function named PATCH that is a RequestHandler
export const PATCH: RequestHandler = async ({ params, request }) => {
	// Retrieve the collection models from a database
	const collections = await getCollectionModels();
	// Identify the specific collection based on the params.collection value from the request
	const collection = collections[params.collection];
	// Read the form data from the request
	const data = await request.formData();
	// Initialize an empty object to hold the parsed form data
	let formData: any = {};
	// Iterate over the keys in the form data
	for (const key of data.keys()) {
		// Try to parse each key-value pair as JSON
		try {
			formData[key] = JSON.parse(data.get(key) as string);
		} catch (e) {
			formData[key] = data.get(key) as string;
		}
	}
	// Retrieve the _id from the form data
	const _id = data.get('_id');
	// Parse the body data
	formData = parse(formData);
	// Save any images from the form data
	const files = await saveImages(data, params.collection);
	// Update the document in the collection with the given _id with the form data and saved images, and return the result as a response
	return new Response(JSON.stringify(await collection.updateOne({ _id }, { ...formData, ...files }, { upsert: true })));
};

// Export an asynchronous function named POST that is a RequestHandler
export const POST: RequestHandler = async ({ params, request }) => {
	// Retrieve the collection models from a database
	const collections = await getCollectionModels();
	// Identify the specific collection based on the params.collection value from the request
	const collection = collections[params.collection];
	// Read the form data from the request
	const data = await request.formData();
	// Initialize an empty object to hold the parsed form data
	const body: any = {};
	// Iterate over the keys in the form data
	for (const key of data.keys()) {
		try {
			// Try to parse each key-value pair as JSON
			body[key] = JSON.parse(data.get(key) as string);
		} catch (e) {
			// If parsing fails, treat the value as a string
			body[key] = data.get(key) as string;
		}
	}
	// Set the status field of the body to 'Published if not set'
	body['status'] = body['status'] ? body['status'] : 'PUBLISHED';

	// If the collection does not exist, return a response with the message 'collection not found!!'
	if (!collection) return new Response('collection not found!!');
	// Save any images from the form data
	const files = await saveImages(data, params.collection);
	// Insert a new document into the collection with the form data and saved images, and return the result as a response
	return new Response(JSON.stringify(await collection.insertMany({ ...body, ...files })));
};

// TODO: deleted files to a trash folder and automatically removing files from the trash folder after 30 days
// Export an asynchronous function named DELETE that is a RequestHandler
export const DELETE: RequestHandler = async ({ params, request }) => {
	// Retrieve the collection models from a database
	const collections = await getCollectionModels();
	// Identify the specific collection based on the params.collection value from the request
	const collection = collections[params.collection];
	// Read the form data from the request
	const data = await request.formData();
	// Retrieve the 'ids' field from the form data and parse it as a JSON string
	let ids = data.get('ids') as string;
	ids = JSON.parse(ids);
	// Log the ids for debugging purposes
	// console.log(ids);
	// console.log(typeof ids);
	// Delete the documents in the collection with the given ids and return the result as a response
	return new Response(
		JSON.stringify(
			await collection.deleteMany({
				_id: {
					$in: ids
				}
			})
		)
	);
};
