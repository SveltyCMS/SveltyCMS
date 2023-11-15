import { getCollections } from '@src/collections';
import { redirect } from '@sveltejs/kit';

//lucia
import { validate } from '@src/utils/utils';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';
import { auth } from './api/db';

//paraglidejs
import { languageTag, setLanguageTag, sourceLanguageTag } from '@src/paraglide/runtime';
// console.log('languageTag', languageTag);
// console.log('setLanguageTag', setLanguageTag);
// console.log('sourceLanguageTag', sourceLanguageTag);

// Initialize currentLanguageTag with a default value

export async function load({ cookies }) {
	// Get the session cookie
	const session = cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;

	// Validate the user's session
	const user = await validate(auth, session);
	console.log('user', user);

	//console.log('collections', collections);
	// filters collection  based on reading permissions and redirects to first left one
	const _filtered = (await getCollections()).filter((c) => c?.permissions?.[user.user.role]?.read != false);
	//console.log('_filtered', _filtered);

	// Redirect to the first collection in the collections array
	throw redirect(302, `/${languageTag()}/${_filtered[0].name}`);
}
