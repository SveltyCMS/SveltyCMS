<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';

	// Get the value of the collection parameter from the page store
	const { collection } = $page.params;

	let schema = {};

	async function getSchema() {
		// Make a GET request to the /builder endpoint with the collection parameter
		const response = await fetch(`/collection/${collection}`);
		const data = await response.json();

		// Get the schema object from the response data
		schema = data;
	}

	onMount(() => {
		getSchema();
	});

	function onSubmit(e) {
		e.preventDefault();

		// TODO: Implement form submission logic
	}
</script>

<h1>Edit {collection} collection</h1>

<form on:submit|preventDefault={onSubmit}>
	<!-- Add input fields for each property in the schema object -->
	{#each Object.entries(schema) as [key, value]}
		<label>
			{key}
			<input type="text" bind:value={schema[key]} />
		</label>
	{/each}

	<button type="submit">Save</button>
</form>
