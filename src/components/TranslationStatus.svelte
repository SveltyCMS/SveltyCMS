<script lang="ts">
	import { publicEnv } from '@root/config/public';

	// Stores
	import { contentLanguage, translationStatusOpen } from '@stores/store';
	// console.log('publicEnv.DEFAULT_CONTENT_LANGUAGE', publicEnv.DEFAULT_CONTENT_LANGUAGE);
	// console.log('publicEnv.AVAILABLE_CONTENT_LANGUAGES', publicEnv.AVAILABLE_CONTENT_LANGUAGES);
	// console.log('$contentLanguage', $contentLanguage);
	// console.log('translationStatusOpen', $translationStatusOpen);

	function handleChange(event) {
		const selectedLanguage = event.target.value.toUpperCase();
		contentLanguage.set(selectedLanguage);
	}

	// Define a function to close any open elements
	function closeOpenStates() {
		translationStatusOpen.set(true);
	}
</script>

<!-- TODO: Show translation Status -->
<!-- Language -->
<select
	class="variant-ghost-surface rounded border-surface-500 dark:text-white"
	bind:value={$contentLanguage}
	on:change={handleChange}
	on:focus={() => {
		closeOpenStates();
	}}
>
	{#each Object.keys(publicEnv.AVAILABLE_CONTENT_LANGUAGES) as value}
		<option {value}>{value.toUpperCase()}</option>
	{/each}
</select>
