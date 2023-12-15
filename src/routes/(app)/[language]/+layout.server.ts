import { error, redirect } from '@sveltejs/kit';
import { auth } from '@api/db';
import { validate } from '@utils/utils';
import { DEFAULT_SESSION_COOKIE_NAME } from 'lucia';

import { getCollections } from '@collections';

import { PUBLIC_CONTENT_LANGUAGES } from '$env/static/public';

import { languageTag } from '@src/paraglide/runtime';

export async function load({ cookies, route, params }) {
	const collections = await getCollections();
	const session = cookies.get(DEFAULT_SESSION_COOKIE_NAME) as string;
	const user = await validate(auth, session);
	const collection = collections.find((c) => c.name == params.collection);

	//console.log(get(collections));

	if (user.user.authMethod == 'token') {
		redirect(302, `/user`);
	}

	if (!languageTag().includes(params.language as any) || (!collection && params.collection)) {
		// if collection is set in url but does not exists.
		error(404, {
			message: 'Not found'
		});
	}

	if (user.status == 200) {
		if (route.id != '/(app)/[language]/[collection]') {
			// else if language and collection both set in url

			// filters collection based on reading permissions and redirects to first left one
			const _filtered = collections.filter((c) => c?.permissions?.[user.user.role]?.read != false);
			redirect(302, `/${params.language || PUBLIC_CONTENT_LANGUAGES}/${_filtered[0].name}`);
		}
		if (collection?.permissions?.[user.user.role]?.read == false) {
			error(404, {
				message: 'No Access to this collection'
			});
		}
		return {
			user: user.user
		};
	} else {
		redirect(302, `/login`);
	}
}
