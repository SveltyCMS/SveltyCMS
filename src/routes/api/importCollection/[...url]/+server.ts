import fs from 'fs';
import mime from 'mime-types';
import type { RequestHandler } from './$types';

// Define the GET request handler
export const GET: RequestHandler = async ({ params }) => {
	// Read the file asynchronously from the collections folder using the provided URL parameter
	const data = await fs.promises.readFile(`${import.meta.env.collectionsFolderJS}/${params.url}`);

	// Return the file data in the response with the appropriate MIME type
	return new Response(data, {
		headers: {
			// Determine the Content-Type based on the file extension using mime.lookup
			'Content-Type': mime.lookup(params.url) as string
		}
	});
};
