<!-- 
@file src/routes/(app)/[language]/[collection]/+page.svelte  
@component
**This component handles the content and logic for a specific page within the application**

Features:
It dynamically fetches and displays data based on the current language and collection route parameters. 
It also handles navigation, mode switching (view, edit, create, media), and SEO metadata for the page.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount, onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import type { Schema } from '@src/collections/types';

	// Stores
	import { page } from '$app/stores';
	import { contentLanguage } from '@stores/store';
	import { collections, collection, collectionValue, mode } from '@root/src/stores/collectionStore.svelte';

	// Components
	import Fields from '@components/Fields.svelte';
	import EntryList from '@components/EntryList.svelte';
	import MediaGallery from '@src/routes/(app)/mediagallery/+page.svelte';

	type ViewMode = 'view' | 'modify' | 'edit' | 'create' | 'media';

	// State variables
	let forwardBackward = $state(false); // Track if using browser history
	let initialLoadComplete = $state(false); // Track initial load
	let navigationError = $state<string | null>(null);
	let lastCollectionValue = $state<any>(null); // Track last collection value for debug

	// Handle collection initialization and navigation
	$effect(() => {
		if (!collections.value || !$page.params.collection) return;

		const selectedCollection = collections.value[$page.params.collection];
		if (selectedCollection) {
			collection.set(selectedCollection as Schema);
			initialLoadComplete = true;
			navigationError = null;
		} else if (initialLoadComplete) {
			navigationError = `Collection not found: ${$page.params.collection}`;
			console.error(navigationError);
			goto('/404');
		}
	});

	// Handle collection changes and navigation
	$effect(() => {
		if (!collection?.value.name) return;

		try {
			if (!forwardBackward) {
				forwardBackward = true;
				goto(`/${contentLanguage.value}/${collection.value.name?.toString()}`);
			}
		} catch (error) {
			navigationError = error instanceof Error ? error.message : 'Navigation error occurred';
			console.error('Navigation error:', error);
		} 
	});

	// Handle language changes
	$effect(() => {
		if (forwardBackward || !initialLoadComplete) return;

		try {
			if (collection.value.name) {
				goto(`/${contentLanguage.value}/${collection.value.name?.toString()}`);
			} else {
				navigationError = 'Collection or collection name is undefined after language change.';
				console.error(navigationError);
				goto('/404');
			}
		} catch (error) {
			navigationError = error instanceof Error ? error.message : 'Language change error occurred';
			console.error('Language change error:', error);
		}
	});
	const title =  $derived(`${collection.value?.name?.toString() || 'Loading...'} - Your Site Title`);
	const description = `View and manage entries for ${collection?.value.name?.toString() || '...'}.`;

	// Update SEO metadata
	$effect(() => {
		if (!browser) return;

		
		document.title = title;

		const metaDescription = document.querySelector('meta[name="description"]');
		if (metaDescription) {
			metaDescription.setAttribute('content', description);
		} else {
			const meta = document.createElement('meta');
			meta.name = 'description';
			meta.content = description;
			document.head.appendChild(meta);
		}
	});

	// Debug logging for collection value changes with debounce
	let debugLogTimeout: number | undefined;
	$effect(() => {
		if (!import.meta.env.DEV) return;

		// Only log if value has actually changed
		if (JSON.stringify(lastCollectionValue) === JSON.stringify(collectionValue.value)) return;

		// Clear any existing timeout
		if (debugLogTimeout) {
			clearTimeout(debugLogTimeout);
		}

		// Set a new timeout
		debugLogTimeout = window.setTimeout(() => {
			lastCollectionValue = Object.assign({}, collectionValue.value);
		}, 100); // 100ms debounce
	});

	// Handle browser history navigation
	function handlePopState() {
		forwardBackward = true;
		const selectedCollection = collections.value[$page.params.collection];
		if (selectedCollection) {
			collection.set(selectedCollection as Schema);
			navigationError = null;
		} else {
			navigationError = `Collection not found during browser navigation: ${$page.params.collection}`;
			console.error(navigationError);
			goto('/404');
		}
	}

	onMount(() => {
		if (browser) {
			window.addEventListener('popstate', handlePopState);
		}
	});

	onDestroy(() => {
		if (browser) {
			window.removeEventListener('popstate', handlePopState);
		}
		if (debugLogTimeout) {
			clearTimeout(debugLogTimeout);
		}
	});

	console.debug("Colelction value", collection.value);
</script>

<div class="content h-full">
	{#if navigationError}
		<div class="error text-error-500" role="alert">
			{navigationError}
		</div>
	{:else if collection.value}
		{#if mode.value === 'view' || mode.value === 'modify'}
			<EntryList />
		{:else if ['edit', 'create'].includes(mode.value)}
			<div id="fields_container" class="fields max-h-[calc(100vh-60px)] overflow-y-auto max-md:max-h-[calc(100vh-120px)]">
				<Fields fields={collection.value.fields} fieldsData={collection.value.fields} customData={collectionValue.value} root={false} />
			</div>
		{:else if mode.value === 'media' && $page.params.collection}
			<MediaGallery />
		{/if}
	{:else}
		<div class="error text-error-500" role="alert">Error: Collection data not available.</div>
	{/if}
</div>
