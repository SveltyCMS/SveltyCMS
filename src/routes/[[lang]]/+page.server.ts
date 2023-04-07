import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { type Actions, fail } from '@sveltejs/kit';
import { auth, luciaVerifyAndReturnUser } from '$lib/server/lucia';

// If the validate method returns a falsy value,
// the hook throws a redirect to the /login page, indicating that the user is not authenticated.
export const load: PageServerLoad = async (event) => {
	const user = await luciaVerifyAndReturnUser(event);
	if (!user) throw redirect(302, '/login');
	return {};
};

// SignOut action logs out the user by invalidating the session and removing the session cookie.
export const actions: Actions = {
	signOut: async (event) => {
		const user = await luciaVerifyAndReturnUser(event);
		if (!user) return fail(401);
		await auth.invalidateAllUserSessions(user.userId); // invalidate session
		event.locals.user = null // remove cookie
	}
};
