import fs from 'fs';
import mime from 'mime-types';
import type { RequestHandler } from './$types';

// System Logs
import {logger} from '@src/utils/logger';

// Define the GET request handler
export const GET: RequestHandler = async ({ params }) => {
	try {
		const filePath = `${import.meta.env.collectionsFolderJS}/${params.url}`;
		logger.debug(`Reading file from path: ${filePath}`);

		// Read the file asynchronously from the collections folder using the provided URL parameter
		const data = await fs.promises.readFile(filePath);

		logger.info('File read successfully', { filePath });

		// Return the file data in the response with the appropriate MIME type
		return new Response(data, {
			headers: {
				// Determine the Content-Type based on the file extension using mime.lookup
				'Content-Type': mime.lookup(params.url) as string
			}
		});
	} catch (error) {
		logger.error('Error reading file:', error);
		return new Response('File not found', { status: 404 });
	}
};
