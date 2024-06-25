import type { RequestHandler } from '@sveltejs/kit';
import { updateCollections } from '@collections';
import { compile } from './compile';

// Define the GET request handler
export const GET: RequestHandler = async () => {
	try {
		// Log the start of the compilation process
		console.log('Starting compilation...');

		// Execute the compile function
		await compile();

		// Execute the updateCollections function with the parameter 'true'
		await updateCollections(true);

		// Log the completion of the collections update
		console.log('Collections updated.');

		// Return a successful response with status 200
		return new Response(null, { status: 200 });
	} catch (error) {
		// Log any errors that occur during the GET request
		console.error('Error during GET /compile:', error);

		// Return an error response with status 500
		return new Response(null, { status: 500 });
	}
};
