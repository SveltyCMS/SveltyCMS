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
	import type { Snippet } from 'svelte';

	// Stores
	import { systemLanguage } from '@stores/store.svelte';

	// Paraglide
	import { getLocale, setLocale, locales as availableLocales } from '@src/paraglide/runtime';

	// Dynamically generate LanguageCode type from Paraglide's available locales.
	type LanguageCode = (typeof availableLocales)[number];

	let { children } = $props<{
		children?: Snippet;
	}>();

	// Effect to handle language changes
	$effect(() => {
		const desiredLang = systemLanguage.value; // Get the desired language from the store

		if (desiredLang) {
			// Ensure the desired language is one of the available locales and is different from the current
			if (availableLocales.includes(desiredLang as any) && getLocale() !== desiredLang) {
				console.log(`System language changed to: ${desiredLang}. Setting Paraglide locale.`);
				setLocale(desiredLang as LanguageCode);
				// Persisting to localStorage ensures the preference is remembered across sessions/reloads.
				if (browser) {
					globalThis.localStorage.setItem('systemLanguage', desiredLang);
				}
			}
		}
	});
</script>

{#key getLocale()}
	{@render children?.()}
{/key}
