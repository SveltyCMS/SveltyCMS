import { publicEnv } from '@root/config/public';
import { getCollections } from '@collections';
import { redirect, type Actions } from '@sveltejs/kit';

// lucia
import { validate } from '@utils/utils';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';
import { auth } from './api/db';

// paraglidejs
import { setLanguageTag, sourceLanguageTag, availableLanguageTags } from '@src/paraglide/runtime';

export async function load({ cookies }) {
	// Get the session cookie
	const session = cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;

	// Validate the user's session
	const user = await validate(auth, session);

	// Get the collections and filter based on reading permissions
	const _filtered = (await getCollections()).filter((c: any) => c?.permissions?.[user.role]?.read != false);

	// Redirect to the first collection in the collections array
	redirect(302, `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${_filtered[0].name}`);
}

export const actions = {
	default: async ({ cookies, request }) => {
		const data = await request.formData();
		const theme = data.get('theme') === 'light' ? 'light' : 'dark';
		// console.log(theme);

		let systemlanguage = data.get('systemlanguage') as string; // get the system language from the form data
		// console.log(systemlanguage);

		// Check if the provided system language is available, if not, default to source language
		if (!availableLanguageTags.includes(sourceLanguageTag)) {
			systemlanguage = sourceLanguageTag;
		}

		// Set the cookies
		cookies.set('theme', theme, { path: '/' });
		cookies.set('systemlanguage', systemlanguage, { path: '/' });

		// Update the language tag in paraglide
		setLanguageTag(systemlanguage as any);

		// Store the system language and theme color in local storage
		localStorage.setItem('systemlanguage', systemlanguage);
		localStorage.setItem('theme', theme);

		// Here you would also update these preferences on the server for the current user

		redirect(303, '/');
	}
} satisfies Actions;
