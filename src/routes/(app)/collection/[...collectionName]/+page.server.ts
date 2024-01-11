import { redirect } from '@sveltejs/kit';
import { auth } from '@api/db';
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
		// Check if it's a POST request with FormData
		if (event.request.method === 'POST') {
			const formData = await event.request.formData();
			console.log(formData);
			// Handle form data processing here
			const collectionName = formData.get('collectionName') as string;
			console.log('Collection Name:', collectionName);

			// Create new collection in database
			//const newCollection = await createCollection(collectionName);

			// Return an appropriate response or redirect
			// Example: return { status: 200, body: { message: 'Collection created successfully' } };
		}

		// Check if editing an existing collection
		const collectionNameParam = event.params.collectionName;
		const isEditMode = collectionNameParam !== 'new';

		console.log(collectionNameParam);
		return {
			user: user.user,
			isEditMode,
			formCollectionName: collectionNameParam
		};
	} else {
		redirect(302, `/login`);
	}
}

// Function to create a new collection in the database
//async function createCollection(collectionName) {
// Implement logic to create a new collection in the database
// Return the newly created collection object
//}
