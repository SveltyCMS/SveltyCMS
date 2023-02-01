import type { LayoutLoad } from './$types';
import { loadLocaleAsync } from '$lib/i18n/i18n-util.async';
import { setLocale } from '$lib/i18n/i18n-svelte';
import { detectLocale } from '$lib/i18n/i18n-util';

export const load = (async (event) => {
	// Detect the locale
	const locale = detectLocale(() => [event.params.lang ?? '']);
	// Load it
	await loadLocaleAsync(locale);
	// Set it
	setLocale(locale);

	return event.data;
}) satisfies LayoutLoad;
