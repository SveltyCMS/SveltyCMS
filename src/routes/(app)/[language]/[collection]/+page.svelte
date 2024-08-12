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

	// Set the value of the collection store to the current collection based on the route parameter
	collection.set($collections[$page.params.collection as string] as Schema); // current collection

	window.onpopstate = async () => {
		ForwardBackward = true;
		collection.set($collections[$page.params.collection as string] as Schema);
	};

	// Subscribe to changes in the collection store and perform redirects
	const unsubscribe = collection.subscribe((_) => {
		$collectionValue = {};
		if (!ForwardBackward) {
			goto(`/${$contentLanguage}/${$collection.name}`);
		}
		ForwardBackward = false;
	});

	onDestroy(() => {
		unsubscribe();
	});

	contentLanguage.subscribe(() => {
		if (!ForwardBackward) {
			goto(`/${$contentLanguage}/${$collection.name}`);
		}
	});

	// Overriding title and description for the page
	export const title = `${$collection.name} - Your Site Title`;
	export const description = `View and manage entries for ${$collection.name}.`;
</script>

/** * @file +page.svelte * @description * This component handles the content and logic for a specific page within * the application that is accessed
by language parameters. It manages the * display of various components (EntryList, Fields, MediaGallery) based on * the current mode of the
application. Additionally, it sets the page-specific * title and description to allow for proper SEO and user context. The component * interacts with
stores to manage collections and user navigation effectively. */

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
