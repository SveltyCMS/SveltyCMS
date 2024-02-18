<script lang="ts">
	// Stores
	import { page } from '$app/stores';
	import { collectionValue, mode, collections, collection } from '@stores/store';
	import { screenWidth } from '@src/stores/sidebarStore';
	import { isSearchVisible } from '@utils/globalSearchIndex';

	// Components
	import HeaderControls from '@src/components/HeaderControls.svelte';
	import RightSidebar from '@src/components/RightSidebar.svelte';
	import Fields from '@components/Fields.svelte';
	import EntryList from '@components/EntryList.svelte';
	import EntryListNew from '@components/EntryList_New.svelte';

	import { goto } from '$app/navigation';
	import { onDestroy, onMount } from 'svelte';
	import type { Schema } from '@collections/types';
	let ForwardBackward: boolean = false; // if using browser history

	// Set the value of the collection store to the collection object from the collections array that has a name property that matches the current page's collection parameter
	collection.set($collections.find((x) => x.name === $page.params.collection) as Schema); // current collection

	globalThis.onpopstate = async () => {
		ForwardBackward = true;
		collection.set($collections.find((x) => x.name === $page.params.collection) as Schema);
	};

	// Subscribe to changes in the collection store and do redirects
	// TODO; fix redirect due to reload?
	let unsubscribe = collection.subscribe((_) => {
		$collectionValue = {};
		if (!ForwardBackward) {
			// alert('ForwardBackward');
			goto(`/${$page.params.language}/${$collection.name}`);
		}
		ForwardBackward = false;
	});
	onDestroy(() => {
		// alert('onDestroy');
		unsubscribe();
	});

	// // Define the function to check if a page entry already exists in the global search index
	// const isPageEntryExists = (index: any[], pageData: any) => {
	// 	return index.some((item: any) => {
	// 		return item.title === pageData.title;
	// 	});
	// };

	// // Mount hook to add the configuration page data to the global search index
	// onMount(() => {
	// 	// Loop through each collection to generate search data
	// 	$collections.forEach((collection) => {
	// 		if (!collection.name) return; // Skip if collection name is undefined

	// 		const triggers = { [`Go to ${collection.name}`]: { path: `/${$page.params.language}/${collection.name}`, action: () => {} } };

	// 		// Create the search data for this collection
	// 		const searchData = {
	// 			title: collection.name,
	// 			description: `View ${collection.description || collection.name}`,
	// 			keywords: [collection.name.toLowerCase()],
	// 			triggers
	// 		};

	// 		// Check if the search data for this collection already exists in the index
	// 		const isDataExists = isPageEntryExists($globalSearchIndex, searchData);

	// 		// If the data doesn't exist, add it to the global search index
	// 		if (!isDataExists) {
	// 			globalSearchIndex.update((index) => [...index, searchData]);
	// 		}
	// 	});
	// });

	// // Clean up on component destruction
	// onDestroy(() => {
	// 	// Perform cleanup here if needed
	// });
</script>

<div class="content flex-grow">
	{#if $mode == 'view' || $mode == 'modify'}
		<!-- <EntryList /> -->
		<EntryListNew />
	{:else if ['edit', 'create'].includes($mode)}
		{#if $screenWidth != 'desktop'}
			<HeaderControls />
			<!-- {:else}
			<RightSidebar /> -->
		{/if}
		<div class="fields">
			<Fields />
		</div>
	{/if}
	{#if ['edit', 'create'].includes($mode)}{/if}
</div>

<style>
	.fields {
		max-height: 100%;
		overflow: auto;
	}

	.content {
		max-height: calc(100% - 400px);
		overflow: hidden;
	}
</style>
