import mongoose from 'mongoose';
import { redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { saveImage, saveDocument, saveAudio, saveVideo, saveRemoteMedia } from '@src/utils/media';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Define a function to get a mongoose model by name
const getModel = (name: string) =>
	mongoose.models[name] || mongoose.model(name, new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }));

export const load: PageServerLoad = async ({ cookies }) => {
	const sessionId = cookies.get(SESSION_COOKIE_NAME);
	if (!sessionId) throw redirect(302, `/login`);

	if (!auth) {
		console.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	const user = await auth.validateSession({ sessionId });
	if (!user) throw redirect(302, `/login`);

	// Fetch all media types concurrently
	const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
	const mediaPromises = mediaTypes.map((type) => getModel(type).find().lean().exec());
	let results = await Promise.all(mediaPromises);

	results = results.map((arr, index) => arr.map((item) => ({ ...item, _id: item._id.toString(), type: mediaTypes[index].split('_')[1] })));
	const media = results.flat();
	console.log(media)
	return { user, media };
};

const saveMediaFile = {
	'application': saveDocument,
	'audio': saveAudio,
	'font': saveDocument,
	'example': saveDocument,
	'image': saveImage,
	'message': saveDocument,
	'model': saveDocument,
	'multipart': saveDocument,
	'text': saveDocument,
	'video': saveVideo,
}

// Collection name for media files
const collectionNames = {
	'application': 'media_documents',
	'audio': 'media_audios',
	'font': 'media_documents',
	'example': 'media_documents',
	'image': 'media_images',
	'message': 'media_documents',
	'model': 'media_documents',
	'multipart': 'media_documents',
	'text': 'media_documents',
	'video': 'media_videos',
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const sessionId = cookies.get(SESSION_COOKIE_NAME);
		if (!sessionId) throw redirect(302, `/login`);

		if (!auth) {
			console.error('Authentication system is not initialized');
			throw error(500, 'Internal Server Error');
		}

		console.log("HEREEEEEEEEEEE")
		const user = await auth.validateSession({ sessionId });
		if (!user) throw redirect(302, `/login`);

		const formData = await request.formData();
		const files = formData.getAll('files');
		console.log(files);

		for (const file of files) {
			try {
				const type = file.type.split('/')[0];
				const { fileInfo } = await saveMediaFile[type](file, collectionNames[type], user.id);
				// const collection = getModel(collectionNames[type]);
				// const newMedia = new collection({
				// 	...fileInfo,
				// 	user: user.id
				// });
				// await newMedia.save();
			} catch (e) {
				console.error(e);
			}
		}

		return { success: true };
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
