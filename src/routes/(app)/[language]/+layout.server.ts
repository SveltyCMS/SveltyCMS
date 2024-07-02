import { publicEnv } from '@root/config/public';
import { error, redirect } from '@sveltejs/kit';
import { getCollections } from '@collections';

// Auth
import { auth } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Paraglide JS
import { contentLanguage } from '@src/stores/store';

export async function load({ cookies, route, params }) {
	if (!auth) {
		console.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	// Secure this page with session cookie
	let session_id = cookies.get(SESSION_COOKIE_NAME);

	// If no session ID is found, create a new session
	if (!session_id) {
		// console.log('Session ID is missing from cookies, creating a new session.');
		try {
			const newSession = await auth.createSession({ userId: 'guestuserId' });
			const sessionCookie = auth.createSessionCookie(newSession);
			cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);
			session_id = sessionCookie.value;
			// console.log('New session created:', session_id);
		} catch (e) {
			console.error('Failed to create a new session:', e);
			throw error(500, 'Internal Server Error');
		}
	}

	if (!auth) {
		console.error('Authentication system is not initialized');
		throw error(500, 'Internal Server Error');
	}

	const user = await auth.validateSession({ session_id });

	// Redirect to login if no valid User session
	if (!user) {
		return redirect(302, '/login');
	}

	// Redirect to user page if lastAuthMethod token
	if (user?.lastAuthMethod === 'token') {
		throw redirect(302, `/user`);
	}

	const collections = await getCollections();
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
