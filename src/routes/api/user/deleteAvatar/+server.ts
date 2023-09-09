import { PUBLIC_MEDIA_FOLDER } from '$env/static/public';
import type { RequestHandler } from '@sveltejs/kit';
import fs from 'fs';
import { auth } from '../../db';

export const POST: RequestHandler = async ({ request }) => {
	const data = await request.json();
	const userID = data.userID;
	let success = false;

	// Get the current avatar URL
	const user = await auth.getUser(userID);

	const oldAvatarURL = user.avatar;
	if (oldAvatarURL) {
		const oldFileName = oldAvatarURL.substring(oldAvatarURL.lastIndexOf('/') + 1);
		const oldFilePath = `${PUBLIC_MEDIA_FOLDER}/images/avatars/${oldFileName}`;
		if (fs.existsSync(oldFilePath)) {
			fs.unlinkSync(oldFilePath); // Delete the old file if it exists
			success = true;
		}
	}

	// Update the user's avatar to an empty string
	auth.updateUserAttributes(userID, {
		avatar: ''
	});

	return new Response(JSON.stringify({ success }), { status: 200 });
};
