import type {LayoutServerLoad} from './$types';

export const load: LayoutServerLoad = (event) => {
    const url = new URL(event.request.url);
    return {
        locale: event.locals.locale,
        user: event.locals.user,
        url: url.pathname
    };
};
