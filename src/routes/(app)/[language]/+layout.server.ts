import { publicEnv } from '@root/config/public';
import { error, redirect } from '@sveltejs/kit';
import { getCollections } from '@collections';

// Auth
import { auth } from '@api/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Paraglide JS
import { contentLanguage } from '@src/stores/store';

export async function load({ cookies, route, params }) {
	const collections = await getCollections();
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
	const user = await auth.validateSession(session_id);
	const collection = collections.find((c: any) => c.name == params.collection);

	// Redirect to user page
	if (user?.lastAuthMethod === 'token') {
		redirect(302, `/user`);
	}

	//  Check if language and collection both set in url
	if (!publicEnv.AVAILABLE_CONTENT_LANGUAGES.includes(params.language as any)) {
		// if language is not available
		error(404, {
			message: `The language '${params.language}' is not available.`
		});
	} else if (!collection && params.collection) {
		// if collection is not found
		error(404, {
			message: `The collection '${params.collection}' does not exist.`
		});
	}

	if (user) {
		if (route.id != '/(app)/[language]/[collection]') {
			// If the route does not have a language parameter and the contentLanguage store is not set
			if (!params.language && !contentLanguage) {
				// Redirect to the default language with the first accessible collection
				const _filtered = collections.filter((c: any) => c?.permissions?.[user.role]?.read != false);
				redirect(302, `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${_filtered[0].name}`);
			} else {
				// filters collection based on reading permissions and redirects to first left one
				const _filtered = collections.filter((c: any) => c?.permissions?.[user.role]?.read != false);
				redirect(302, `/${params.language || contentLanguage}/${_filtered[0].name}`);
			}
		}
		if (collection?.permissions?.[user.role]?.read == false) {
			error(404, {
				message: 'No Access to this collection'
			});
		}
		return {
			user: user
		};
	} else {
		redirect(302, `/login`);
	}
}
