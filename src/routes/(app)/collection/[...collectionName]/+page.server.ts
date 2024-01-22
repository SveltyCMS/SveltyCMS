import { redirect } from '@sveltejs/kit';
import { auth } from '@api/db';
import { validate } from '@utils/utils';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';
import { mode, collections } from '@stores/store';

// Load function that handles authentication, user validation, and data fetching
export async function load(event) {
	// Get session cookie value as string
	const session = event.cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
	// Validate user using auth and session value
	const user = await validate(auth, session);

	// If user status is 200, return user object
	if (user.status === 200) {
		// Get collection name from URL parameters
		const collectionNameParam = event.params.collectionName;
		console.log('collectionNameParam:', collectionNameParam);

		let collectionData: any;

		collections.subscribe((collections) => {
			// Check if the collection exists in the store
			const collectionExists = collections.some((collection) => collection.name === collectionNameParam);

			// Set $mode to "view" for new collections and "edit" for existing collections
			mode.set(collectionExists ? 'edit' : 'create');

			// Check if the collectionData is defined
			if (collectionExists) {
				collectionData = JSON.stringify(collections.find((collection) => collection.name === collectionNameParam));
				console.log(collectionData);
			}
		});
		// Subscribe to the mode store and log the current mode to the console
		mode.subscribe((mode) => {
			console.log('Current mode:', mode);
		});

		return {
			user: user,
			formCollectionName: collectionNameParam,
			collectionData: collectionData
		};
	} else {
		return redirect(302, '/login');
	}
}
