<script lang="ts">
	import { publicEnv } from '@root/config/public';

	// Stores
	import { contentLanguage, translationStatusOpen } from '@stores/store';

	function handleChange(event) {
		const selectedLanguage = event.target.value.toLowerCase();
		contentLanguage.set(selectedLanguage);
	}

	// Define a function to close any open elements
	function closeOpenStates() {
		translationStatusOpen.set(true);
	}
</script>

<!-- TODO: Show translation Status -->
<!-- Mobile -->
<select
	class="variant-ghost-surface rounded border-surface-500 dark:text-white md:hidden"
	bind:value={$contentLanguage}
	on:change={handleChange}
	on:focus={() => {
		closeOpenStates();
	}}
>
	{#each Object.keys(publicEnv.DEFAULT_CONTENT_LANGUAGE) as value}
		<option {value}>{value.toUpperCase()}</option>
	{/each}
</select>

<!-- Desktop -->
<select
	class="variant-ghost-surface hidden rounded border-surface-500 dark:text-white md:block"
	bind:value={$contentLanguage}
	on:change={handleChange}
	on:focus={() => {
		closeOpenStates();
	}}
>
	{#each Object.entries(publicEnv.DEFAULT_CONTENT_LANGUAGE) as [value, label]}
		<option {value}>{label}</option>
	{/each}
</select>
