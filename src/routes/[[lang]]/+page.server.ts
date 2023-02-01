import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { type Actions, fail } from '@sveltejs/kit';
import { auth } from '$lib/server/lucia';

export const load: PageServerLoad = async ({ locals }) => {
	const session = await locals.validate();
	if (!session) throw redirect(302, '/login');
	return {};
};

export const actions: Actions = {
	signOut: async ({ locals }) => {
		const session = await locals.validate();
		if (!session) return fail(401);
		await auth.invalidateSession(session.sessionId); // invalidate session
		locals.setSession(null); // remove cookie
	}
};
