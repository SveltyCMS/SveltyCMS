import { redirect } from '@sveltejs/kit';
import { auth } from '@src/routes/api/db';
import { validate } from '@src/utils/utils';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';

// // Load function that handles authentication, user validation, and data fetching
// export async function load(event: any) {
// 	const session = event.cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
// 	const user = await validate(auth, session);

// 	if (user.status === 200) {
// 		// Dynamically import collection data
// 		const collectionModule = await import(`@src/collections/${event.params.collectionName}.ts`);
// 		const collectionData = collectionModule.default;
// 		console.log('collectionData', collectionData);
// 		return {
// 			props: {
// 				user: user.user,
// 				items: collectionData // Pass the collection data as a prop
// 			}
// 		};
// 	} else {
// 		throw redirect(302, `/login`);
// 	}
// }
