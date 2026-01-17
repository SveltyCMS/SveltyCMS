<!-- 
@file src/components/ParaglideSvelteKit.svelte
@component
**ParaglideSvelteKit component for handling translations and localization.**

@example
<ParaglideSvelteKit>
	{@render children?.()}
</ParaglideSvelteKit>

### Props
- `children` {function} - Function to render the content

### Features
- Translatable
- Localizable
-->

<script lang="ts">
	import { browser } from '$app/environment';

	// Stores
	import { app } from '@shared/stores/store.svelte';

	// Paraglide
	import { getLocale, setLocale, locales as availableLocales } from '@shared/paraglide/runtime';

	// Dynamically generate LanguageCode type from Paraglide's available locales.
	type LanguageCode = (typeof availableLocales)[number];

	const { children } = $props();

	let locale = $derived(getLocale());

	// Effect to handle language changes
	$effect(() => {
		const desiredLang = app.systemLanguage; // Get the desired language from the store

		if (desiredLang) {
			// Ensure the desired language is one of the available locales and is different from the current
			if (availableLocales.includes(desiredLang) && locale !== desiredLang) {
				setLocale(desiredLang as LanguageCode, { reload: false });
				// Persisting to localStorage ensures the preference is remembered across sessions/reloads.
				if (browser) {
					globalThis.localStorage.setItem('systemLanguage', desiredLang);
				}
				locale = desiredLang;
			}
		}
	});
</script>

{#key locale}
	{@render children?.()}
{/key}
