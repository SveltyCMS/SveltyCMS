import type { RequestHandler } from './$types';
import mongoose from 'mongoose';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const limit = 10;
		const search = url.searchParams.get('search') as string;
		const re = new RegExp(RegExp.escape(search), 'i');

		// Ensure the required media collections exist
		const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
		await Promise.all(
			mediaTypes.map(async (type) => {
				if (!mongoose.models[type]) {
					await mongoose.model(type, new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }));
				}
			})
		);

		// Fetch files for each media type
		const fetchFilesPromises = mediaTypes.map(async (type) => {
			const files = await mongoose.models[type].find(search ? { 'original.name': { $regex: re } } : {}).limit(limit);
			return files.map((file) => ({ ...file.toObject(), type: type.split('_')[1].charAt(0).toUpperCase() + type.split('_')[1].slice(1) }));
		});

		// Concatenate and return files from all media types
		const allFiles = (await Promise.all(fetchFilesPromises)).flat();
		return new Response(JSON.stringify(allFiles));
	} catch (error) {
		console.error('Error fetching media files:', error);
		return new Response('Error fetching media files', { status: 500 });
	}
};
