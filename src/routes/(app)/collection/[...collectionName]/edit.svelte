<script lang="ts">
	import { writable } from 'svelte/store';
	import { page } from '$app/stores';

	// Get the value of the collection parameter from the page store
	let { collectionName } = $page.params;

	// Create a writable store for schema
	let schema = writable({});

	export async function load({ page }) {
		// Get the value of the collection parameter from the page store
		const { collectionName } = page.params;

		// Dynamically import the collection schema
		const module = await import(`@src/collections/${collectionName}.ts`);

		// Create a writable store for schema and set its value
		let schema = writable(module.default);

		return { props: { schema } };
	}

	function onSubmit(e) {
		e.preventDefault();

		// TODO: Implement form submission logic
	}
</script>

<h1 class="text-2xl text-error-500">Edit {collectionName} collection</h1>

<form on:submit|preventDefault={onSubmit}>
	<!-- Add input fields for each property in the schema object -->
	{#each Object.entries($schema) as [key, value]}
		<label>
			{key}
			<input type="text" bind:value={$schema[key]} />
		</label>
	{/each}

	<button type="submit">Save</button>
</form>
