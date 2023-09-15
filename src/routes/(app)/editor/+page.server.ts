import { PUBLIC_MEDIA_FOLDER } from '$env/static/public';
import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';

import { redirect } from '@sveltejs/kit';
import { auth } from '../../api/db';
import { validate } from '@src/utils/utils';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';

export async function load(event: any) {
	// Secure this page with session cookie
	const session = event.cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
	// Validate the user's session
	const user = await validate(auth, session);
	// If validation fails, redirect the user to the login page
	if (user.status !== 200) {
		throw redirect(302, `/login`);
	}

	// Return an empty object if validation is successful
	return {
		user: user.user
	};
}
