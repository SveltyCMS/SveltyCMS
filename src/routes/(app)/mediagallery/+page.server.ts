import mongoose from 'mongoose';
import { redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { saveImage, saveDocument, saveAudio, saveVideo, saveRemoteMedia } from '@src/utils/utils';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Define a function to get a mongoose model by name
const getModel = (name: string) =>
	mongoose.models[name] || mongoose.model(name, new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }));

export const load: PageServerLoad = async ({ cookies }) => {
	const session_id = cookies.get(SESSION_COOKIE_NAME);
	if (!session_id) throw redirect(302, `/login`);

	if (!auth) {
		console.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	const user = await auth.validateSession({ session_id });
	if (!user) throw redirect(302, `/login`);

	// Fetch all media types concurrently
	const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
	const mediaPromises = mediaTypes.map((type) => getModel(type).find().lean().exec());
	const results = await Promise.all(mediaPromises);

	const media = results
		.flat()
		.map((items, index) => items.map((item) => ({ ...item, type: mediaTypes[index].split('_')[1] })))
		.flat();

	return { user, media };
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const session_id = cookies.get(SESSION_COOKIE_NAME);
		if (!session_id) throw redirect(302, `/login`);

		if (!auth) {
			console.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const user = await auth.validateSession({ session_id });
		if (!user) throw redirect(302, `/login`);

		const formData = await request.formData();
		for (const file of formData.values()) {
			if (file instanceof File) {
				let collectionName;
				let saveFunction;

				if (file.type.startsWith('image/')) {
					collectionName = 'media_images';
					saveFunction = saveImage;
				} else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
					collectionName = 'media_documents';
					saveFunction = saveDocument;
				} else if (file.type.startsWith('audio/')) {
					collectionName = 'media_audio';
					saveFunction = saveAudio;
				} else if (file.type.startsWith('video/')) {
					collectionName = 'media_videos';
					saveFunction = saveVideo;
				} else {
					collectionName = 'media_remote';
					saveFunction = saveRemoteMedia;
				}

				const { fileInfo } = await saveFunction(file, collectionName);

				const collection = getModel(collectionName);
				const newMedia = new collection({
					...fileInfo,
					user: user.id
				});
				await newMedia.save();
			}
		}

		return { success: true };
	}
};
