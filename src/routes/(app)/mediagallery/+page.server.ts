import mongoose from 'mongoose';
import { redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { auth } from '@api/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import { saveImage, saveDocument, saveAudio, saveVideo, saveRemoteMedia } from '@src/utils/utils';

// Define a function to get a mongoose model by name
const getModel = (name: string) =>
	mongoose.models[name] || mongoose.model(name, new mongoose.Schema({}, { typeKey: '$type', strict: false, timestamps: true }));

export const load: PageServerLoad = async (event) => {
	const session_id = event.cookies.get(SESSION_COOKIE_NAME);
	if (!session_id) throw redirect(302, `/login`);

	const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));
	if (!user) throw redirect(302, `/login`);

	const MediaImages = getModel('media_images');
	const MediaDocuments = getModel('media_documents');
	const MediaAudio = getModel('media_audio');
	const MediaVideos = getModel('media_videos');
	const MediaRemote = getModel('media_remote');

	const images = await MediaImages.find().lean().exec();
	const documents = await MediaDocuments.find().lean().exec();
	const audio = await MediaAudio.find().lean().exec();
	const videos = await MediaVideos.find().lean().exec();
	const remote = await MediaRemote.find().lean().exec();

	const media = [
		...images.map((item) => ({ ...item, type: 'image' })),
		...documents.map((item) => ({ ...item, type: 'document' })),
		...audio.map((item) => ({ ...item, type: 'audio' })),
		...videos.map((item) => ({ ...item, type: 'video' })),
		...remote.map((item) => ({ ...item, type: 'remote' }))
	];

	return { user, media };
};

export const actions: Actions = {
	default: async (event) => {
		const session_id = event.cookies.get(SESSION_COOKIE_NAME);
		if (!session_id) throw redirect(302, `/login`);

		const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));
		if (!user) throw redirect(302, `/login`);

		const formData = await event.request.formData();

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

				const { id, fileInfo } = await saveFunction(file, collectionName);

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
