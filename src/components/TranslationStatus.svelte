<script lang="ts">
	import { PUBLIC_CONTENT_LANGUAGES } from '$env/static/public';
	import { contentLanguage } from '@src/stores/store';
	import { translationStatusOpen } from '@src/stores/store';

	//console.log('contentLanguage', contentLanguage);

	// Manually parse the object from JSON string
	let options = JSON.parse(PUBLIC_CONTENT_LANGUAGES.replace(/'/g, '"'));

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
	class="variant-ghost-surface rounded border-surface-500 text-white md:hidden"
	bind:value={$contentLanguage}
	on:change={handleChange}
	on:focus={() => {
		closeOpenStates();
	}}
>
	{#each Object.keys(options) as value}
		<option {value}>{value.toUpperCase()}</option>
	{/each}
</select>
<!-- Desktop -->
<select
	class="variant-ghost-surface hidden rounded border-surface-500 text-white md:block"
	bind:value={$contentLanguage}
	on:change={handleChange}
	on:focus={() => {
		closeOpenStates();
	}}
>
	{#each Object.entries(options) as [value, label]}
		<option {value}>{label}</option>
	{/each}
</select>
