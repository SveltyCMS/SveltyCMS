import { auth, githubAuth, luciaSetCookie } from '$lib/server/lucia';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async (event) => {
	const code = event.url.searchParams.get('code');
	const state = event.url.searchParams.get('state');
	const storedState = event.cookies.get('oauth_state');
	if (storedState !== state || !code || !state) throw new Response(null, { status: 401 });
	try {
		const { existingUser, providerUser, createUser } = await githubAuth.validateCallback(code);
		const user =
			existingUser ??
			(await createUser({
				username: providerUser.login
			}));
		const session = await auth.createSession(user.userId);
		await luciaSetCookie(event, session)
	} catch (e) {
		return new Response(null, {
			status: 500
		});
	}
	throw redirect(302, '/login');
};
