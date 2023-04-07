import type { LayoutServerLoad } from './$types';

export const load = (async (event) => {
	return {
		locale: event.locals.locale,
		user: event.locals.user,
	};
}) satisfies LayoutServerLoad;
