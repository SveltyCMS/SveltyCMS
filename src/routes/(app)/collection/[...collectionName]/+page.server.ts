import { redirect } from '@sveltejs/kit';
import { auth } from '@api/db';
import { validate } from '@utils/utils';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';

// Load function that handles authentication and user validation
export async function load(event) {
	// Get session cookie value as string
	const session = event.cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
	// Validate user using auth and session value
	const user = await validate(auth, session);
	// If user status is 200, return user object
	if (user.status == 200) {
		return {
			user: user.user
		};
	} else {
		redirect(302, `/login`);
	}
}
