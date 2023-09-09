<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { collectionValue, mode, collections, collection } from '@src/stores/store';
	import type { Schema } from '@src/collections/types';

	import Fields from '@src/components/Fields.svelte';
	import EntryList from '@src/components/EntryList.svelte';

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

<div class="flex">
	<div class="max-h-screen flex-grow overflow-auto">
		{#if $mode == 'view' || $mode == 'delete'}
			<EntryList />
		{:else if ['edit', 'create'].includes($mode)}
			<Fields />
		{/if}
	</div>
</div>
