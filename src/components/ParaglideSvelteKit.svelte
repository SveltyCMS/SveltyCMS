<script lang="ts">
	import { languageTag, onSetLanguageTag } from '@src/paraglide/runtime';
	import { onMount } from 'svelte';

	// initialize the language tag
	$: _languageTag = languageTag;

	// Check if the environment is not server-side rendering (SSR)
	if (import.meta.env.SSR === false) {
		onSetLanguageTag((newLanguageTag) => {
			_languageTag = () => newLanguageTag;

			// Store the new language tag in a cookie
			document.cookie = `languageTag=${newLanguageTag}; path=/; max-age=31536000`; // max-age is set to one year
		});
	}

	onMount(() => {
		if (_languageTag) {
			// Store the new language tag in a cookie
			document.cookie = `languageTag=${_languageTag}; path=/; max-age=31536000; Secure; SameSite=Lax`;
		}
	});

	// When the page loads, check if the languageTag cookie exists and use its value
</script>

{#key _languageTag}
	<slot />
{/key}
