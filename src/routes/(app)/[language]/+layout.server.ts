import { publicEnv } from '@root/config/public';
import { error, redirect } from '@sveltejs/kit';
import { getCollections } from '@collections';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';
import mongoose from 'mongoose';

// Paraglide JS
import { contentLanguage } from '@src/stores/store';

export async function load({ cookies, route, params }) {
	const collections = await getCollections();
	const session_id = cookies.get(SESSION_COOKIE_NAME) as string;
	const user = await auth.validateSession(new mongoose.Types.ObjectId(session_id));

	// Redirect to login if no valid User session
	if (!user) throw redirect(302, `/login`);

	// Redirect to user page if lastAuthMethod token
	if (user?.lastAuthMethod === 'token') {
		throw redirect(302, `/user`);
	}

	const collection = Object.values(collections).find((c: any) => c.name === params.collection);

	// Check if language and collection both set in url
	if (!publicEnv.AVAILABLE_CONTENT_LANGUAGES.includes(params.language as any)) {
		// If language is not available
		throw error(404, {
			message: `The language '${params.language}' is not available.`
		});
	} else if (!collection && params.collection) {
		// If collection is not found
		throw error(404, {
			message: `The collection '${params.collection}' does not exist.`
		});
	}

	if (user) {
		if (route.id !== '/(app)/[language]/[collection]') {
			// If the route does not have a language parameter and the contentLanguage store is not set
			if (!params.language && !contentLanguage) {
				// Redirect to the default language with the first accessible collection
				const _filtered = Object.values(collections).filter((c: any) => c?.permissions?.[user.role]?.read !== false);
				throw redirect(302, `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${_filtered[0].name}`);
			} else {
				// Filters collection based on reading permissions and redirects to the first accessible one
				const _filtered = Object.values(collections).filter((c: any) => c?.permissions?.[user.role]?.read !== false);
				throw redirect(302, `/${params.language || contentLanguage}/${_filtered[0].name}`);
			}
		}
		if (collection?.permissions?.[user.role]?.read === false) {
			throw error(404, {
				message: 'No Access to this collection'
			});
		}
		return {
			user
		};
	}
}
