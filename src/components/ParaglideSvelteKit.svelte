<!-- 
@file src/components/ParaglideSvelteKit.svelte
@description ParaglideSvelteKit component
-->

<script lang="ts">
	import { browser } from '$app/environment';

	// Stores
	import { systemLanguage } from '@stores/store';

	import { languageTag, onSetLanguageTag, setLanguageTag } from '@src/paraglide/runtime';
	import type { Snippet } from 'svelte';

	// All available language codes from src/messages
	type LanguageCode =
		| 'da'
		| 'de'
		| 'en'
		| 'es'
		| 'fi'
		| 'fr'
		| 'hi'
		| 'it'
		| 'ja'
		| 'ka'
		| 'ne'
		| 'nl'
		| 'no'
		| 'pl'
		| 'pt'
		| 'sl'
		| 'sr'
		| 'sv'
		| 'tr'
		| 'uk'
		| 'ur'
		| 'zh';

	let { children } = $props<{
		children?: Snippet;
	}>();

	// Initialize the language tag with $state
	let _languageTag = $state<() => LanguageCode>(() => languageTag());

	// Check if the environment is not server-side rendering (SSR)
	if (import.meta.env.SSR === false) {
		onSetLanguageTag((newLanguageTag) => {
			_languageTag = () => newLanguageTag as LanguageCode;
		});
	}

	// Effect to handle language changes
	$effect(() => {
		if ($systemLanguage) {
			setLanguageTag($systemLanguage); // Update the language tag
			browser && globalThis.localStorage.setItem('systemLanguage', $systemLanguage);
		}
	});
</script>

{#key _languageTag()}
	{@render children?.()}
{/key}
