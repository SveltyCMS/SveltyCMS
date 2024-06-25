import { publicEnv } from '@root/config/public';
import { getCollections } from '@collections';
import { redirect, type Actions, error } from '@sveltejs/kit';

// Auth
import { auth, initializationPromise } from '@api/databases/db';
import { SESSION_COOKIE_NAME } from '@src/auth';

// Paraglidejs
import { setLanguageTag, sourceLanguageTag, availableLanguageTags } from '@src/paraglide/runtime';

// Import logger
import logger from '@utils/logger';

// Define the available language tags for type safety
type LanguageTag = (typeof availableLanguageTags)[number];

export async function load({ cookies }) {
	console.log('Load function started.');

	// Wait for initialization to complete
	try {
		await initializationPromise;
		console.log('Initialization promise resolved.');
	} catch (e) {
		console.error('Initialization failed:', e);
		throw error(500, 'Failed to initialize the authentication system.');
	}

	if (!auth) {
		console.error('Authentication system is not initialized');
		throw error(500, 'Authentication system not initialized.');
	}

	// Secure this page with session cookie
	const sessionId = cookies.get(SESSION_COOKIE_NAME);
	console.log('Session ID:', sessionId);

	// If no session ID is found, create a new session
	// if (!sessionId) {
	// 	console.log('Session ID is missing from cookies, creating a new session.');
	// 	try {
	// 		const newSession = await auth.createSession({ userId: 'guestUserId', expires: 3600000 });
	// 		const sessionCookie = auth.createSessionCookie(newSession);
	// 		cookies.set(sessionCookie.name, sessionCookie.value, { ...sessionCookie.attributes, httpOnly: true, secure: true });
	// 		sessionId = sessionCookie.value;
	// 		console.log('New session created:', sessionId);
	// 	} catch (e) {
	// 		console.error('Failed to create a new session:', e);
	// 		throw error(500, 'Failed to create a new session.');
	// 	}
	// }

	// Validate the user's session
	let user: any;
	try {
		user = await auth.validateSession({ sessionId: sessionId! });
		console.log('User:', user);
	} catch (e) {
		console.error('Session validation failed:', e);
		throw redirect(302, '/login');
	}

	if (!user) {
		// console.warn('User not found, redirecting to login.');
		throw redirect(302, '/login');
	}

	// Get the collections and filter based on reading permissions
	let collections: any;
	try {
		collections = await getCollections();
		// console.log('Collections:', collections);
	} catch (e) {
		logger.error('Failed to get collections:', e as Error);
		throw error(500, 'Internal Server Error');
	}

	const filteredCollections = Object.values(collections).filter((c: any) => c?.permissions?.[user.role]?.read !== false);
	// console.log('Filtered collections:', filteredCollections);

	if (filteredCollections.length === 0) {
		// console.error('No collections found for user.');
		throw error(404, {
			message: "You don't have access to any collection"
		});
	}

	// Redirect to the first collection in the collections array
	const firstCollection = filteredCollections[0];
	if (firstCollection && firstCollection.name) {
		throw redirect(302, `/${publicEnv.DEFAULT_CONTENT_LANGUAGE}/${firstCollection.name}`);
	} else {
		console.error('No valid collections to redirect to.');
		throw error(500, 'No valid collections to redirect to.');
	}
}

export const actions = {
	default: async ({ cookies, request }) => {
		const data = await request.formData();
		const theme = data.get('theme') === 'light' ? 'light' : 'dark';
		let systemLanguage = data.get('systemlanguage') as LanguageTag;

		// Check if the provided system language is available, if not, default to source language
		if (!availableLanguageTags.includes(systemLanguage)) {
			systemLanguage = sourceLanguageTag;
		}

		// Set the cookies
		cookies.set('theme', theme, { path: '/' });
		cookies.set('systemlanguage', systemLanguage, { path: '/' });

		// Update the language tag in Paraglide
		setLanguageTag(systemLanguage);

		if (!auth) {
			console.error('Authentication system is not initialized');
			throw error(500, 'Authentication system not initialized.');
		}

		try {
			// Assume a session creation method is called here and a session object is returned
			const session = await auth.createSession({ userId: 'someuser_id', expires: 3600000 });
			const sessionCookie = auth.createSessionCookie(session);

			// Set the session cookie
			cookies.set(sessionCookie.name, sessionCookie.value, { ...sessionCookie.attributes, httpOnly: true, secure: true });
		} catch (e) {
			logger.error('Session creation failed:', e as Error);
			throw error(500, 'Failed to create a session.');
		}

		throw redirect(303, '/');
	}
} satisfies Actions;
