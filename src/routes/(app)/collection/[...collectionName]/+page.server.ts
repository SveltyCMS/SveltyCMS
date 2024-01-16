// import { redirect } from '@sveltejs/kit';
// import { auth } from '@api/db';
// import { validate } from '@utils/utils';
// import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';

// // Load function that handles authentication, user validation, and data fetching
// export async function load(event) {
// 	// Get session cookie value as string
// 	const session = event.cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
// 	// Validate user using auth and session value
// 	const user = await validate(auth, session);

// 	// If user status is 200, return user object
// 	if (user.status === 200) {
// 		// Check if it's a POST request with FormData
// 		if (event.request.method === 'POST') {
// 			const formData = await event.request.formData();
// 			console.log(formData);
// 			// Handle form data processing here
// 			const collectionName = formData.get('collectionName') as string;
// 			console.log('Collection Name:', collectionName);

// 			// Create new collection in database
// 			//const newCollection = await createCollection(collectionName);

// 			// Return an appropriate response or redirect
// 			// Example: return { status: 200, body: { message: 'Collection created successfully' } };
// 		}

// 		// Check if editing an existing collection
// 		const collectionNameParam = event.params.collectionName;
// 		const isEditMode = collectionNameParam !== 'new';

// 		console.log(collectionNameParam);
// 		return {
// 			user: user.user,
// 			isEditMode,
// 			formCollectionName: collectionNameParam
// 		};
// 	} else {
// 		redirect(302, `/login`);
// 	}
// }

// // Function to create a new collection in the database
// //async function createCollection(collectionName) {
// // Implement logic to create a new collection in the database
// // Return the newly created collection object
// //}

import { redirect } from '@sveltejs/kit';
import { auth } from '@api/db';
import { mode, collections } from '@stores/store';
import { validate } from '@utils/utils';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';

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
			// props: {
			user: user.user,
			formCollectionName: collectionNameParam,
			collectionData: collectionData
			// }
		};
	} else {
		return redirect(302, '/login');
	}
}
