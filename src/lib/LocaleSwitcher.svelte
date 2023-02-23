<script lang="ts">
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/stores';
	import { setLocale, locale } from '$i18n/i18n-svelte';
	import type { Locales } from '$i18n/i18n-types';
	import { locales } from '$i18n/i18n-util';
	import { loadLocaleAsync } from '$i18n/i18n-util.async';
	import { replaceLocaleInUrl } from '$src/lib/utils/utils';

	import { popup } from '@skeletonlabs/skeleton';
	
let languageSettings: PopupSettings = {
	// Set the event as: click | hover | hover-click
	event: 'click',
	// Provide a matching 'data-popup' value.
	target: 'language-dropdown'
};
			
	import { fade } from 'svelte/transition';

	const switchLocale = async (newLocale: Locales, updateHistoryState = true) => {
		if (!newLocale || $locale === newLocale) return;

		// load new dictionary from server
		await loadLocaleAsync(newLocale);

		// select locale
		setLocale(newLocale);

		// update `lang` attribute
		document.querySelector('html')!.setAttribute('lang', newLocale);

		if (updateHistoryState) {
			// update url to reflect locale changes
			history.pushState({ locale: newLocale }, '', replaceLocaleInUrl($page.url, newLocale));
		}

		// run the `load` function again
		invalidateAll();
	};

	// update locale when navigating via browser back/forward buttons
	const handlePopStateEvent = async ({ state }: PopStateEvent) => switchLocale(state.locale, false);

	// update locale when page store changes
	$: if (browser) {
		const lang = $page.params.lang as Locales;
		switchLocale(lang, false);
		history.replaceState(
			{ ...history.state, locale: lang },
			'',
			replaceLocaleInUrl($page.url, lang)
		);
	}
</script>

<svelte:window on:popstate={handlePopStateEvent} />

<!-- TODO: make a reusable Language Switcher  -->
<span class="relative inline-block text-left border-2 border-surface-600 rounded-full" in:fade>
  
	<button
		class="btn btn-sm uppercase font-bold"
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
	</nav>
</span>
