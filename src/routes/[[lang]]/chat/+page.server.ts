import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import type { Actions } from '@sveltejs/kit';
import { luciaRemoveCookieAndSignOut, luciaVerifyAndReturnUser } from '$lib/server/lucia';

// If the validate method returns a falsy value,
// the hook throws a redirect to the /login page, indicating that the user is not authenticated.
export const load: PageServerLoad = async (event) => {
	const user = await luciaVerifyAndReturnUser(event);
	if (!user) throw redirect(302, '/login');
	event.locals.user = user
	return {};
};


export const actions: Actions = {
	signOut: async (event) => {
		await luciaRemoveCookieAndSignOut(event);
	}
};
