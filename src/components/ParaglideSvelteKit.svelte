<script lang="ts">
	import { languageTag, onSetLanguageTag } from '@src/paraglide/runtime';

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

	// When the page loads, check if the languageTag cookie exists and use its value
</script>

{#key _languageTag}
	<slot />
{/key}
