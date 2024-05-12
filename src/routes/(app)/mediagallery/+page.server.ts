import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { redirect } from '@sveltejs/kit';
import type { Actions, RequestEvent } from './$types';

// Auth
import { auth } from '@api/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Media collections
import { MediaImages, MediaDocuments, MediaAudio, MediaVideos, MediaRemote } from '@api/db';

// Utils
import { sanitize, saveMedia } from '@src/utils/utils';

export async function load(event: RequestEvent) {
	// Secure this page with session cookie
	const session_id = event.cookies.get(SESSION_COOKIE_NAME) as string;
	// Validate the user's session
	const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));
	// If validation fails, redirect the user to the login page
	if (!user) {
		redirect(302, `/login`);
	}
	// Return user data
	return { props: { user: user } };
}

export const actions: Actions = {
	default: async (event: RequestEvent) => {
		const user = await auth.validateSession(new mongoose.Types.ObjectId(event.cookies.get(SESSION_COOKIE_NAME)));

		if (!user) {
			redirect(302, `/login`);
		}

		const files = await event.request.formData();

		for (const file of files.values()) {
			const { name, type, size, filepath } = file;
			const buffer = fs.readFileSync(filepath);

			// Determine the appropriate collection based on the file type
			let collectionName;
			if (type.startsWith('image/')) {
				collectionName = 'media_images';
			} else if (type.startsWith('application/pdf') || type.endsWith('.pdf')) {
				collectionName = 'media_documents';
			} else if (type.startsWith('audio/')) {
				collectionName = 'media_audio';
			} else if (type.startsWith('video/')) {
				collectionName = 'media_videos';
			} else {
				collectionName = 'media_remote';
			}

			// Save the file using the saveMedia function from utils.ts
			const { id, fileInfo } = await saveMedia(type, file, collectionName);

			// Save the file to the appropriate collection
			const collection = mongoose.models[collectionName];
			const newMedia = new collection({
				...fileInfo,
				user: user._id
			});
			await newMedia.save();
		}

		return { success: true };
	}
};
