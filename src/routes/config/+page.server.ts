import { redirect } from '@sveltejs/kit';
import { auth } from '../api/db';
import { validate } from '@src/utils/utils';
import { SESSION_COOKIE_NAME } from 'lucia-auth';

export async function load(event: any) {
	// Secure this page with session cookie
	const session = event.cookies.get(SESSION_COOKIE_NAME) as string;
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
