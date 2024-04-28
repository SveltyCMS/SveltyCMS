<script lang="ts">
	import { goto } from '$app/navigation';
	import { onDestroy } from 'svelte';
	import type { Schema } from '@collections/types';

	// Stores
	import { page } from '$app/stores';
	import { collectionValue, mode, collections, collection, contentLanguage } from '@stores/store';

	// Components
	import Fields from '@components/Fields.svelte';
	import EntryList from '@components/EntryList.svelte';
	import MediaGallery from '@src/routes/(app)/mediagallery/MediaGallery.svelte';

	let ForwardBackward: boolean = false; // if using browser history

	// Set the value of the collection store to the collection object from the collections array that has a name property that matches the current page's collection parameter
	collection.set($collections.find((x) => x.name === $page.params.collection) as Schema); // current collection

	window.onpopstate = async () => {
		ForwardBackward = true;
		collection.set($collections.find((x) => x.name === $page.params.collection) as Schema);
	};

	// Subscribe to changes in the collection store and do redirects
	// TODO; fix redirect due to reload?
	const unsubscribe = collection.subscribe(() => {
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

	contentLanguage.subscribe(() => {
		if (!ForwardBackward) {
			goto(`/${$contentLanguage}/${$collection.name}`);
		}
	});
</script>

<div class="content">
	{#if $mode == 'view' || $mode == 'modify'}
		<EntryList />
	{:else if ['edit', 'create'].includes($mode)}
		<div id="fields_container" class="fields max-h-[calc(100vh-60px)] overflow-y-auto max-md:max-h-[calc(100vh-120px)]">
			<Fields />
		</div>
	{:else if $mode == 'media'}
		<MediaGallery />
	{/if}
</div>
