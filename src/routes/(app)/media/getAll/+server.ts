import type { RequestHandler } from './$types';
import { dbAdapter } from '@api/databases/db'; // Import your database adapter

export const GET: RequestHandler = async ({ url }) => {
	try {
		const limit = 10;
		const search = url.searchParams.get('search');

		// Ensure RegExp.escape is implemented
		if (!RegExp.escape) {
			(RegExp as any).escape = function (s: string) {
				return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
			};
		}

		const re = search ? new RegExp(RegExp.escape(search), 'i') : null;

		// Define media types
		const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];

		// Fetch files for each media type
		const fetchFilesPromises = mediaTypes.map(async (type) => {
			const query = search ? { 'original.name': { $regex: re } } : {};
			const files = await dbAdapter.findMany(type, query, { limit });
			return files.map((file: any) => ({ ...file, type: type.split('_')[1].charAt(0).toUpperCase() + type.split('_')[1].slice(1) }));
		});

		// Concatenate and return files from all media types
		const allFiles = (await Promise.all(fetchFilesPromises)).flat();
		return new Response(JSON.stringify(allFiles));
	} catch (error) {
		console.error('Error fetching media files:', error);
		return new Response('Error fetching media files', { status: 500 });
	}
};
