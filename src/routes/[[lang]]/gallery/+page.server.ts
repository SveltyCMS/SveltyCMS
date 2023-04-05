import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { type Actions, fail } from '@sveltejs/kit';
import { auth } from '$lib/server/lucia';

// If the validate method returns a falsy value,
// the hook throws a redirect to the /login page, indicating that the user is not authenticated.
export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.validate();
	if (!session) throw redirect(302, '/login');
	return {};
};

// SignOut action logs out the user by invalidating the session and removing the session cookie.
export const actions: Actions = {
	signOut: async ({ locals }) => {
		const session = await locals.validate();
		if (!session) return fail(401);
		await auth.invalidateSession(session.sessionId); // invalidate session
		locals.setSession(null); // remove cookie
	}
};
