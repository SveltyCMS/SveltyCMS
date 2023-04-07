<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import { setLocale, locale } from '$i18n/i18n-svelte';
	import type { Locales } from '$i18n/i18n-types';
	import { locales } from '$i18n/i18n-util';
	import { loadLocaleAsync } from '$i18n/i18n-util.async';
	import { replaceLocaleInUrl } from '$src/lib/utils/utils';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	export let user: any = '';

	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';

	import { Autocomplete } from '@skeletonlabs/skeleton';
	import type { AutocompleteOption } from '@skeletonlabs/skeleton';

	let languageSettings: PopupSettings = {
		// Set the event as: click | hover | hover-click
		event: 'click',
		placement: 'bottom',
		// Provide a matching 'data-popup' value.
		target: 'language-dropdown'
	};

	$: LanguageLabel = $locale;

	let lang: any;

	// Local
	let inputPopupDemo = '';
	let popupSettings: PopupSettings = {
		event: 'focus',
		target: 'popupAutocomplete',
		placement: 'bottom'
	};
	let inputDemo = '';
	const flavorOptions: AutocompleteOption[] = [
		{ label: 'Vanilla', value: 'vanilla', keywords: 'plain, basic', meta: { healthy: false } },
		{ label: 'Chocolate', value: 'chocolate', keywords: 'dark, white', meta: { healthy: false } },
		{ label: 'Strawberry', value: 'strawberry', keywords: 'fruit', meta: { healthy: true } },
		{
			label: 'Neapolitan',
			value: 'neapolitan',
			keywords: 'mix, strawberry, chocolate, vanilla',
			meta: { healthy: false }
		},
		{ label: 'Pineapple', value: 'pineapple', keywords: 'fruit', meta: { healthy: true } },
		{ label: 'Peach', value: 'peach', keywords: 'fruit', meta: { healthy: true } }
	];

	function onDemoSelection(event: any): void {
		console.log(event.detail);
		inputDemo = event.detail.label;
	}

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
		goto(`${$page.url.origin}${replaceLocaleInUrl($page.url, lang, user)}`);
	}

	// language search
	let searchQuery = '';
	let filteredLocales = locales;

	const handleInput = (event: { target: { value: string } }) => {
		searchQuery = event.target.value;
		filteredLocales = locales.filter((loc) =>
			loc.toLowerCase().includes(searchQuery.toLowerCase())
		);
	};
</script>

<svelte:window on:popstate={handlePopStateEvent} />

<button
	class="btn btn-sm rounded-full variant-filled-surface justify-between uppercase"
	use:popup={languageSettings}
>
	{LanguageLabel}
</button>

<div class="uppercase variant-filled-surface rounded-sm" data-popup="language-dropdown">
	{#if locales.length > 3}
		<input type="text" placeholder="Search..." on:input={handleInput} class="text-black" />
	{/if}

	{#if locales.length <= 3}
		{#each locales as loc}
			{#if locales.length <= 4}
				<ListBoxItem
					bind:group={LanguageLabel}
					on:click={() => (LanguageLabel = loc)}
					name={loc}
					value={loc}
					class="hover:!variant-filled-tertiary"
				>
					{loc}
				</ListBoxItem>
			{:else if locales.length > 4}
				<!-- TODO: add autocomplete -->
				<ListBoxItem
					bind:group={LanguageLabel}
					on:click={() => (LanguageLabel = loc)}
					name={loc}
					value={loc}
					class="hover:!variant-filled-primary"
				>
					{loc}
				</ListBoxItem>
			{/if}
		{/each}
	{:else}
		{#each filteredLocales as loc}
			{#if loc !== LanguageLabel}
				<ListBoxItem
					bind:group={LanguageLabel}
					on:click={() => (LanguageLabel = loc)}
					name={loc}
					value={loc}
					class="hover:!variant-filled-tertiary"
				>
					{loc}
				</ListBoxItem>
			{/if}
		{/each}
	{/if}
	<!-- Arrow -->
	<div class="arrow variant-filled-surface" />
</div>
