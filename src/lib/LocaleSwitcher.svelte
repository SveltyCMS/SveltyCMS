<script lang="ts">
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { setLocale, locale } from '$i18n/i18n-svelte';
	import type { Locales } from '$i18n/i18n-types';
	import { locales } from '$i18n/i18n-util';
	import { loadLocaleAsync } from '$i18n/i18n-util.async';
	import { replaceLocaleInUrl } from '$src/lib/utils/utils';
	import { ListBox, ListBoxItem, SlideToggle, type PopupSettings } from '@skeletonlabs/skeleton';
	import { onMount } from 'svelte';
	export let user: any = '';
	// import { popup } from '@skeletonlabs/skeleton';

	$: LanguageLabel = $locale;
	let lang: any;

	const switchLocale = async (newLocale: Locales, updateHistoryState = true) => {
		if (!newLocale || $locale === newLocale) return;
		// console.log('new locale', newLocale);
		// load new dictionary from server
		await loadLocaleAsync(newLocale);

		// select locale
		setLocale(newLocale);

		// update `lang` attribute
		document.querySelector('html')!.setAttribute('lang', newLocale);

		if (updateHistoryState) {
			// update url to reflect locale changes
			history.pushState({ locale: newLocale }, '', replaceLocaleInUrl($page.url, newLocale, user));
		}

		// run the `load` function again
		//invalidateAll();
	};

	// update locale when navigating via browser back/forward buttons
	const handlePopStateEvent = async ({ state }: PopStateEvent) => switchLocale(state.locale, false);

	onMount(() => {
		console.log('user', user);

		if (
			locales.includes($page.url.pathname.split('/')[1] as Locales) &&
			user.length > 0 &&
			user !== ''
		) {
			LanguageLabel = $page.url.pathname.split('/')[1] as Locales;
		}
	});
	// update locale when page store changes
	$: if (browser) {
		lang = LanguageLabel;

		switchLocale(lang, false);

		history.replaceState(
			{ ...history.state, locale: lang },
			'',
			replaceLocaleInUrl($page.url, lang, user)
		);
	}
</script>

<svelte:window on:popstate={handlePopStateEvent} />

<!-- TODO: make a reusable Language Switcher  -->

<select
	class="block w-full px-4 py-2 text-lg font-bold uppercase text-gray-900 border border-gray-300 rounded-lg bg-gray-50 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500 dark:focus:border-blue-500"
	bind:value={LanguageLabel}
>
	{#each locales as loc}
		<option class="font-bold text-lg" value={loc}>
			{loc}
		</option>
	{/each}
</select>
<!-- <button
	class="btn variant-ghost-secondary btn-sm uppercase font-bold"
	use:popup={languageSettings}
	id="language-dropdown"
	aria-haspopup="true"
	aria-expanded="false"
	>{$locale}
</button>
<nav class="text-white list-nav card shadow-xl uppercase" data-popup="language-dropdown">
	<ul>
		{#each locales.filter((l) => l !== $locale) as l}
			<li>
				<a class:active={l === $locale} href={`${replaceLocaleInUrl($page.url, l)}`}>
					{l}
				</a>
			</li>
		{/each}
	</ul>
</nav> -->
