import { error, redirect } from '@sveltejs/kit';
import { auth } from '../api/db';
import { validate } from '@src/utils/utils';
import { SESSION_COOKIE_NAME } from 'lucia-auth';

import { getCollections } from '@src/collections';

import { PUBLIC_CONTENT_LANGUAGES } from '$env/static/public';
import { locales } from '@src/i18n/i18n-util';

export async function load({ cookies, route, params }) {
	const collections = await getCollections();
	const session = cookies.get(SESSION_COOKIE_NAME) as string;
	const user = await validate(auth, session);
	const collection = collections.find((c) => c.name == params.collection);

	//console.log(get(collections));

	if (user.user.authMethod == 'token') {
		throw redirect(302, `/user`);
	}

	if (!locales.includes(params.language as any) || (!collection && params.collection)) {
		// if collection is set in url but does not exists.
		throw error(404, {
			message: 'Not found'
		});
	}

	if (user.status == 200) {
		if (route.id != '/[language]/[collection]') {
			// else if language and collection both set in url

			// filters collection based on reading permissions and redirects to first left one
			const _filtered = collections.filter((c) => c?.permissions?.[user.user.role]?.read != false);
			throw redirect(302, `/${params.language || PUBLIC_CONTENT_LANGUAGES}/${_filtered[0].name}`);
		}
		if (collection?.permissions?.[user.user.role]?.read == false) {
			throw error(404, {
				message: 'No Access to this collection'
			});
		}
		return {
			user: user.user
		};
	} else {
		throw redirect(302, `/login`);
	}
}
