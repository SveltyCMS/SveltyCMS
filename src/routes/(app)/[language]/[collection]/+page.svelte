<!-- 
@file src/routes/(app)/[language]/[collection]/+page.svelte  
@description This component handles the content and logic for a specific page within the application. 
It dynamically fetches and displays data based on the current language and collection route parameters. 
It also handles navigation, mode switching (view, edit, create, media), and SEO metadata for the page.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { Schema } from '@collections/types';

	// Stores
	import { page } from '$app/stores';
	import { contentLanguage } from '@stores/store';
	import { collectionValue, mode, collections, collection } from '@stores/collectionStore';

	// Components
	import Fields from '@components/Fields.svelte';
	import EntryList from '@components/EntryList.svelte';
	import MediaGallery from '@src/routes/(app)/mediagallery/+page.svelte';

	//System logger

	let forwardBackward = false; // Track if using browser history
	let initialLoadComplete = false; // Track initial load

	// Reactive re-computation for setting collection based on route parameters
	$: if ($collections && $page.params.collection) {
		const selectedCollection = $collections[$page.params.collection];
		if (selectedCollection) {
			collection.set(selectedCollection as Schema);
			initialLoadComplete = true;
		} else if (initialLoadComplete) {
			console.error('Collection not found:', $page.params.collection);
			goto('/404'); // Redirect to a 404 page or handle error appropriately
		}
	}

	// Handle browser history navigation
	onMount(() => {
		if (browser) {
			window.onpopstate = () => {
				forwardBackward = true;
				const selectedCollection = $collections[$page.params.collection];
				if (selectedCollection) {
					collection.set(selectedCollection as Schema);
				} else {
					console.error('Collection not found during browser navigation:', $page.params.collection);
					goto('/404'); // Handle error or redirect
				}
			};
		}
	});

	// Subscribe and handle collection changes
	const unsubscribe = collection.subscribe(($collection) => {
		if ($collection?.name) {
			// Reset collection value
			// collectionValue.set({});
			if (!forwardBackward) {
				goto(`/${$contentLanguage}/${$collection.name}`);
			}
		}
		forwardBackward = false;
	});

	onDestroy(() => {
		unsubscribe(); // Clean up subscription
	});

	// Handle language changes reactively
	$: if (!forwardBackward && $collection?.name) {
		goto(`/${$contentLanguage}/${$collection.name}`);
	} else if (!forwardBackward && initialLoadComplete && !$collection?.name) {
		console.error('Collection or collection name is undefined after language change.');
		goto('/404'); // Handle error or redirect
	}

	// Reactive SEO metadata
	$: if (browser) {
		document.title = `${$collection?.name || 'Loading...'} - Your Site Title`;
		document.querySelector('meta[name="description"]')?.setAttribute('content', `View and manage entries for ${$collection?.name || '...'}.`);
	}
	$: console.debug(`Page view $collectionValue: ${JSON.stringify($collectionValue)}`);
</script>

<div class="content h-full">
	{#if $collection}
		{#if $mode === 'view' || $mode === 'modify'}
			<EntryList />
		{:else if ['edit', 'create'].includes($mode)}
			<div id="fields_container" class="fields max-h-[calc(100vh-60px)] overflow-y-auto max-md:max-h-[calc(100vh-120px)]">
				<Fields fields={$collection.fields} mode={$mode} fieldsData={$collection.fields} bind:customData={$collectionValue} root={false} />
			</div>
		{:else if $mode === 'media' && $page.params.collection}
			<MediaGallery />
		{/if}
	{:else}
		<div class="error">Error: Collection data not available.</div>
	{/if}
</div>
