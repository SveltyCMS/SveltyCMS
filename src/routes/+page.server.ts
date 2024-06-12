import { publicEnv } from '@root/config/public';
import { getCollections } from '@collections';
import { redirect, type Actions, error } from '@sveltejs/kit';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import mongoose from 'mongoose';

// Paraglidejs
import { setLanguageTag, sourceLanguageTag, availableLanguageTags } from '@src/paraglide/runtime';

export async function load({ cookies }) {
	// Get the session cookie
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;

	// Validate the user's session
	const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));
	if (!user) throw redirect(302, `/login`);

	// Get the collections and filter based on reading permissions
	const _filtered = Object.values(await getCollections()).filter((c: any) => user && c?.permissions?.[user.role]?.read != false);

	if (_filtered.length == 0) {
		throw error(404, {
			message: "You don't have access to any collection"
		});
	}

	// Redirect to the first collection in the collections array
	redirect(302, `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${_filtered[0].name}`);
}

export const actions = {
	default: async ({ cookies, request }) => {
		const data = await request.formData();
		const theme = data.get('theme') === 'light' ? 'light' : 'dark';

		let systemlanguage = data.get('systemlanguage') as string; // get the system language from the form data

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

		redirect(303, '/');
	}
} satisfies Actions;
