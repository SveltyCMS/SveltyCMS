// lucia
import { auth } from '$lib/server/lucia';
import { dbConnect } from '$lib/utils/db';
import { handleHooks } from '@lucia-auth/sveltekit';
import { sequence } from '@sveltejs/kit/hooks';

// typesave-i18n
import type { Locales } from '$i18n/i18n-types';
import { detectLocale, i18n, isLocale } from '$i18n/i18n-util';
import { loadAllLocales } from '$i18n/i18n-util.sync';
import type { Handle, RequestEvent } from '@sveltejs/kit';
import { initAcceptLanguageHeaderDetector } from 'typesafe-i18n/detectors';

loadAllLocales();
const L = i18n();

export const handle: Handle = sequence(dbConnect, handleHooks(auth), async ({ event, resolve }) => {
	// read language slug
	const [, lang] = event.url.pathname.split('/');
	// redirect to base locale if no locale slug was found
	if (!lang) {
		const locale = getPreferredLocale(event);

		event.locals.locale = locale;

		if (locale == 'en') {
			return resolve(event);
		} else {
			return new Response(null, {
				status: 302,
				headers: { Location: `/${locale}` }
			});
		}
	}

	// if slug is not a locale, use base locale (e.g. api endpoints)
	const locale = isLocale(lang) ? lang : getPreferredLocale(event);
	const LL = L[locale];

	// bind locale and translation functions to current request
	event.locals.locale = locale;
	event.locals.LL = LL;

	// replace html lang attribute with correct language
	return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', locale) });
});

const getPreferredLocale = ({ request }: RequestEvent) => {
	// detect the preferred language the user has configured in his browser
	// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language
	const acceptLanguageDetector = initAcceptLanguageHeaderDetector(request);

	return detectLocale(acceptLanguageDetector);
};
