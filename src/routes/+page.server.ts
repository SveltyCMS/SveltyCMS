import { PUBLIC_SYSTEM_LANGUAGE } from '$env/static/public';
import { getCollections } from '@src/collections';
import { collections } from '@src/stores/store';
import { validate } from '@src/utils/utils';
import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE_NAME } from 'lucia-auth';
import { auth } from './api/db';

export async function load({ cookies }) {
	// Get the session cookie
	const session = cookies.get(SESSION_COOKIE_NAME) as string;

	// Validate the user's session
	const user = await validate(auth, session);

	//console.log('collections', collections);
	// filters collection  based on reading permissions and redirects to first left one
	const _filtered = (await getCollections()).filter(
		(c) => c?.permissions?.[user.user.role]?.read != false
	);
	//console.log('_filtered', _filtered);

	// Redirect to the first collection in the collections array
	throw redirect(302, `/${PUBLIC_SYSTEM_LANGUAGE}/${_filtered[0].name}`);
}
