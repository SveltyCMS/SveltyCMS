<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { setLocale, locale } from '$i18n/i18n-svelte';
	import type { Locales } from '$i18n/i18n-types';
	import { locales } from '$i18n/i18n-util';
	import { loadLocaleAsync } from '$i18n/i18n-util.async';
	import { replaceLocaleInUrl } from '$src/lib/utils/utils';
	import { onMount } from 'svelte';
	export let user: any = '';

	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';

	import { fade } from 'svelte/transition';

	let languageSettings: PopupSettings = {
		// Set the event as: click | hover | hover-click
		event: 'click',
		placement: 'top',
		// Provide a matching 'data-popup' value.
		target: 'language-dropdown'
	};

	$: LanguageLabel = $locale;
	let lang: any;

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
			history.pushState({ locale: newLocale }, '', replaceLocaleInUrl($page.url, newLocale, user));
		}
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

<button
	class="btn btn-sm rounded-full variant-ghost-secondary justify-between uppercase"
	use:popup={languageSettings}
>
	{LanguageLabel}
</button>

<div class="uppercase variant-filled-secondary" data-popup="language-dropdown">
	<!-- Listbox -->
	<ListBox rounded="rounded-none">
		{#each locales as loc}
			{#if loc !== LanguageLabel}
				<ListBoxItem
					bind:group={LanguageLabel}
					on:click={() => (LanguageLabel = loc)}
					name={loc}
					value={loc}
				>
					{loc}
				</ListBoxItem>
			{/if}
		{/each}
	</ListBox>
	<!-- Arrow -->
	<div class="arrow variant-filled-secondary" />
</div>
