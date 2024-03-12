<script lang="ts">
	import { publicEnv } from '@root/config/public';

	// Stores
	import { contentLanguage, translationStatusOpen } from '@stores/store';

	function handleChange(event) {
		const selectedLanguage = event.target.value.toLowerCase();
		contentLanguage.set(selectedLanguage);
		translationStatusOpen.set(false);
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
	{#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as lang}
		<option value={lang}>{lang.toUpperCase()}</option>
	{/each}
</select>
