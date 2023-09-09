import type { RequestHandler } from '@sveltejs/kit';
import { getCollectionModels } from '../db';
import { updateCollections } from '@src/collections';
import { compile } from './compile';

// Define an async GET request handler
export const GET: RequestHandler = async () => {
	// Call the compile function to transpile TypeScript files into JavaScript files
	await compile();

	// Update the collections and log the collection models
	await updateCollections(true);
	console.log(await getCollectionModels());

	// Return a response with a 200 OK status and no body
	return new Response(null, { status: 200 });
};
