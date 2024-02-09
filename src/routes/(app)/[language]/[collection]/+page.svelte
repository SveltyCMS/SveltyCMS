<script lang="ts">
	// Stores
	import { page } from '$app/stores';
	import { collectionValue, mode, collections, collection } from '@stores/store';

	// Components
	import Fields from '@components/Fields.svelte';
	import EntryList from '@components/EntryList.svelte';
	import EntryListNew from '@components/EntryList_New.svelte';

	import { goto } from '$app/navigation';

	import type { Schema } from '@collections/types';

	let ForwardBackward: boolean = false; // if using browser history

	// Set the value of the collection store to the collection object from the collections array that has a name property that matches the current page's collection parameter
	collection.set($collections.find((x) => x.name === $page.params.collection) as Schema); // current collection

	globalThis.onpopstate = async () => {
		ForwardBackward = true;
		collection.set($collections.find((x) => x.name === $page.params.collection) as Schema);
	};

	collection.subscribe((_) => {
		$collectionValue = {};
		if (!ForwardBackward) {
			goto(`/${$page.params.language}/${$collection.name}`);
		}
		ForwardBackward = false;
	});
</script>

<div class="content flex-grow">
	{#if $mode == 'view' || $mode == 'delete'}
		<EntryList />
		<!-- <EntryListNew /> -->
	{:else if ['edit', 'create'].includes($mode)}
		<div class="fields">
			<Fields />
		</div>
	{/if}
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
