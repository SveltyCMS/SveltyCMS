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
			let collection;
			if (type.startsWith('image/')) {
				collection = MediaImages;
			} else if (type.startsWith('application/pdf') || type.endsWith('.pdf')) {
				collection = MediaDocuments;
			} else if (type.startsWith('audio/')) {
				collection = MediaAudio;
			} else if (type.startsWith('video/')) {
				collection = MediaVideos;
			} else {
				collection = MediaRemote;
			}

			// Save the file to the appropriate collection
			const newMedia = new collection({
				name,
				type,
				size,
				data: buffer,
				user: user._id
			});
			await newMedia.save();

			// Save the uploaded file to the 'mediaFiles' folder
			const savePath = path.join(process.cwd(), 'mediaFiles', name);
			fs.writeFileSync(savePath, buffer);
		}

		return { success: true };
	}
};
