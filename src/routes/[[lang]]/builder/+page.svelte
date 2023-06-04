<script lang="ts">
	import { goto } from '$app/navigation';
	import axios from 'axios';

	// show/hide Left Sidebar
	import AnimatedHamburger from '$src/components/AnimatedHamburger.svelte';
	import { toggleLeftSidebar } from '$src/stores/store';
	//export let open = false;
	export let switchSideBar = false;

	let collections: string | any[] = [];

	// fetch the list of collections from the database
	async function fetchCollections() {
		const response = await axios.get('/api/collections');
		collections = response.data;
	}

	// call the fetchCollections function when the component is mounted
	//onMount(fetchCollections);
</script>

<div class="flex mr-1 align-centre mb-2">
	{#if !switchSideBar && $toggleLeftSidebar}
		<AnimatedHamburger />
	{/if}

	<h1 class={!$toggleLeftSidebar ? 'ml-2' : ''}>Collection Builder</h1>
</div>

<!-- display available collections -->
{#if collections.length > 0}
	<ul>
		{#each collections as collection}
			<li>{collection.collectionName}</li>
		{/each}
	</ul>
{:else}
	<p class="mt-4">No collections have been created yet. Please add your first Collection.</p>
	<div class="flex flex-col items-center justify-center h-screen">
		<button
			class="btn variant-filled-secondary text-white px-4 py-2 rounded-md mt-4"
			on:click|preventDefault={() => goto('/builder/new')}
		>
			<div class="flex flex-col items-center">
				<iconify-icon icon="ic:baseline-add-circle" width="50" class="text-primary-500" />
				Start building your first collection
			</div>
		</button>
	</div>
{/if}

{#if collections.length > 0}
	<button
		class="btn bg-blue-500 text-white px-4 py-2 rounded"
		on:click|preventDefault={() => goto('/builder/new')}>Add more Collections</button
	>
{/if}
