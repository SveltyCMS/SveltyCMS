import { redirect } from '@sveltejs/kit';
import { auth } from '../../api/db';
import { validate } from '@src/utils/utils';
import { SESSION_COOKIE_NAME } from 'lucia-auth';

// Load function that handles authentication and user validation
export async function load(event: any) {
	const session = event.cookies.get(SESSION_COOKIE_NAME) as string;
	const user = await validate(auth, session);
	if (user.status === 200) {
		return {
			user: user.user
		};
	} else {
		throw redirect(302, `/login`);
	}
}
