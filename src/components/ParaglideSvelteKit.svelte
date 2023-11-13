<script lang="ts">
	import { languageTag, onSetLanguageTag } from '@src/paraglide/runtime';

	// initialize the language tag
	$: _languageTag = languageTag;

	// Check if the environment is not server-side rendering (SSR)
	if (import.meta.env.SSR === false) {
		onSetLanguageTag((newLanguageTag) => {
			window.location.href = `/${newLanguageTag}`;
		});
	}
</script>

{#key _languageTag}
	<slot />
{/key}
