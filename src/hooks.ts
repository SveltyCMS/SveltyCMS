import { sourceLanguageTag } from '@src/paraglide/runtime';

function getTextDirection(lang: string): string {
	const rtlLanguages = ['ar', 'he', 'fa', 'ur', 'dv', 'ha', 'khw', 'ks', 'ku', 'ps', 'syr', 'ug', 'yi']; // Add more RTL languages if needed
	return rtlLanguages.includes(lang) ? 'rtl' : 'ltr';
}

export const handle = async ({ request, resolve }) => {
	console.log('handle called');

	const response = await resolve(request); // Get the original response

	console.log('request.locals.lang:', request.locals.lang);
	console.log('sourceLanguageTag:', sourceLanguageTag);
	console.log('response.body:', response.body);

	const lang = request.locals.lang || sourceLanguageTag;
	const dir = getTextDirection(lang);

	response.body = response.body.replace('%lang%', lang).replace('%dir%', dir);

	return response;
};
