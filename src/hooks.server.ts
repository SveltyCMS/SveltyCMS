// lucia
import {auth} from "$lib/server/lucia";
import {User} from '$lib/models/user-model';

// sveltekit
import {sequence} from "@sveltejs/kit/hooks";
import {systemLanguage} from "./stores/store";
import {dbConnect} from "$lib/utils/db";

// typesave-i18n
import {detectLocale, i18n, isLocale} from "$i18n/i18n-util";
import {loadAllLocales} from "$i18n/i18n-util.sync";
import type {Handle, RequestEvent} from "@sveltejs/kit";
import {initAcceptLanguageHeaderDetector} from "typesafe-i18n/detectors";
import type {UserSchema} from "lucia-auth";

loadAllLocales();
const L = i18n();

export const handle: Handle = sequence(
    dbConnect,
    async ({event, resolve}) => {

        const lucia = auth.handleRequest(event);
        const auth_object = await lucia.validate();
        if (auth_object) {
            const {user, session} = await auth.validateSessionUser(
                auth_object.sessionId
            );
            if (session.fresh) {
                lucia.setSession(session);
            }
            if (user && user?.userId) {
                event.locals.user = JSON.parse(JSON.stringify(await User.findById(user.userId))) as UserSchema
            }

        }

        // read language slug
        const [, lang] = event.url.pathname.split("/");

        // redirect to base locale if no locale slug was found
        if (!lang) {
            const locale = getPreferredLocale(event);
            if (locale == "en") {
                event.locals.locale = locale;
                return resolve(event);
            } else {
                return new Response(null, {
                    status: 302,
                    headers: {Location: `/${locale}`},
                });
            }
        }

        // if slug is not a locale, use base locale (e.g. api endpoints)
        //const locale = isLocale(lang) ? (lang as Locales) : getPreferredLocale(event)
        const locale = getPreferredLocale(event);
        const LL = L[locale];
        systemLanguage.set(getPreferredLocale(event));

        // bind locale and translation functions to current request
        event.locals.locale = locale;
        event.locals.LL = LL;

        // replace html lang attribute with correct language
        return resolve(event, {
            transformPageChunk: ({html}) => html.replace("%lang%", locale),
        });
    }
);

export const getPreferredLocale = ({request}: RequestEvent) => {
    // detect the preferred language the user has configured in his browser
    // https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept-Language
    const acceptLanguageDetector = initAcceptLanguageHeaderDetector(request);
    return detectLocale(acceptLanguageDetector);
};
