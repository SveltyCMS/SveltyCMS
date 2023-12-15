<script lang="ts">
	import { languageTag, onSetLanguageTag, setLanguageTag } from '@src/paraglide/runtime';
	import { systemLanguage } from '@stores/store';

	// initialize the language tag
	$: _languageTag = languageTag;

	// Check if the environment is not server-side rendering (SSR)
	if (import.meta.env.SSR === false) {
		onSetLanguageTag((newLanguageTag) => {
			_languageTag = () => newLanguageTag;
		});
	}

	systemLanguage.subscribe((value: any) => {
		setLanguageTag(value); // Update the language tag
		globalThis.localStorage.setItem('systemLanguage', value);
	});
</script>

{#key _languageTag}
	<slot />
{/key}
