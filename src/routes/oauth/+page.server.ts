import { redirect } from '@sveltejs/kit';
import { auth, googleAuth } from '../api/db';
import type { PageServerLoad } from './$types';
import mongoose from 'mongoose';
import type { User } from 'lucia-auth';

// const generatePassword = () => {
// 	const length = 16;
// 	const charset = 'abcdefghijklmnopqrstuvwxyz';
// 	const charset2 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
// 	const charset3 = '0123456789';
// 	const charset4 = '@$!%*#?&';

// 	let retVal = '';
// 	while (retVal.length < length) {
// 		retVal += charset.charAt(Math.floor(Math.random() * charset.length));
// 		retVal += charset2.charAt(Math.floor(Math.random() * charset2.length));
// 		retVal += charset3.charAt(Math.floor(Math.random() * charset3.length));
// 		retVal += charset4.charAt(Math.floor(Math.random() * charset4.length));
// 	}
// 	return retVal;
// };

export const load: PageServerLoad = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const stateCookie = cookies.get('google_oauth_state');

	const result = {
		errors: [],
		success: true,
		message: '',
		data: {}
	};

	if (!code || !state || !stateCookie || state != stateCookie) throw redirect(302, '/login');

	try {
		const OAuth = await googleAuth.validateCallback(code);
		// console.log(OAuth);
		const { getExistingUser, googleUser, createUser, providerId, providerUserId } = OAuth;

		const getUser = async () : Promise<[User, boolean]> => {
			const existingUser = await getExistingUser();

			if (existingUser) return [existingUser, false];

			/// Probably will never happen but just to be sure.
			if (!googleUser.email) {
				throw new Error('Google did not return an email address.');
			}
			const username = googleUser.name ?? '';

			const isFirst = (await mongoose.models['auth_key'].countDocuments()) == 0;

			const user = await createUser({
				attributes: {
					email: googleUser.email,
					username,
					role: isFirst ? 'admin' : 'user'
				}
			});

			return [user, true];
		};

		const [user, needSignIn] = await getUser();
		// console.log('user', user, needSignIn);

		if (!user) throw new Error('User not found.');
		const session = await auth.createSession({
			userId: user.userId,
			attributes: {}
		});

		const sessionCookie = auth.createSessionCookie(session);
		// console.log('userID:', user.userId, sessionCookie);
		cookies.set(sessionCookie.name, sessionCookie.value, sessionCookie.attributes);

		result.data = { user };
	} catch (e) {
		console.error(e);
		throw redirect(302, '/login');
	}
	throw redirect(303, '/');
};
// So do you want me to commit the code and finish the order, if there are any problems tell me to fix them for you.
