import { redirect, error } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { saveImage, saveDocument, saveAudio, saveVideo, saveRemoteMedia } from '@src/utils/media';

// Auth
import { auth, dbAdapter } from '@src/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

export const load: PageServerLoad = async ({ cookies }) => {
	const session_id = cookies.get(SESSION_COOKIE_NAME);
	if (!session_id) throw redirect(302, `/login`);

	if (!auth || !dbAdapter) {
		console.error('Authentication system or database adapter is not initialized');
		throw error(500, 'Internal Server Error');
	}

	const user = await auth.validateSession({ session_id });
	if (!user) throw redirect(302, `/login`);

	// Fetch all media types concurrently
	const mediaTypes = ['media_images', 'media_documents', 'media_audio', 'media_videos', 'media_remote'];
	const mediaPromises = mediaTypes.map((type) => dbAdapter.findMany(type, {}));
	let results = await Promise.all(mediaPromises);

	results = results.map((arr, index) => arr.map((item) => ({ ...item, _id: item._id.toString(), type: mediaTypes[index].split('_')[1] })));
	const media = results.flat();
	console.log(media);
	return { user, media };
};

const saveMediaFile = {
	application: saveDocument,
	audio: saveAudio,
	font: saveDocument,
	example: saveDocument,
	image: saveImage,
	message: saveDocument,
	model: saveDocument,
	multipart: saveDocument,
	text: saveDocument,
	video: saveVideo
};

// Collection name for media files
const collectionNames = {
	application: 'media_documents',
	audio: 'media_audio',
	font: 'media_documents',
	example: 'media_documents',
	image: 'media_images',
	message: 'media_documents',
	model: 'media_documents',
	multipart: 'media_documents',
	text: 'media_documents',
	video: 'media_videos'
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const session_id = cookies.get(SESSION_COOKIE_NAME);
		if (!session_id) throw redirect(302, `/login`);

		if (!auth || !dbAdapter) {
			console.error('Authentication system or database adapter is not initialized');
			throw error(500, 'Internal Server Error');
		}

		const user = await auth.validateSession({ session_id });
		if (!user) throw redirect(302, `/login`);

		const formData = await request.formData();
		const files = formData.getAll('files');

		for (const file of files) {
			try {
				const type = file.type.split('/')[0];
				const { fileInfo } = await saveMediaFile[type](file, collectionNames[type], user.id);
				await dbAdapter.insertMany(collectionNames[type], [{ ...fileInfo, user: user.id }]);
			} catch (e) {
				console.error(e);
			}
		}

		return { success: true };
	}
};
