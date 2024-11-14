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

	// Handle collection initialization and navigation
	$effect(() => {
		if (!$collections || !$page.params.collection) return;

		const selectedCollection = $collections[$page.params.collection];
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
		if (!$collection?.name) return;

		try {
			if (!forwardBackward) {
				goto(`/${$contentLanguage}/${$collection.name}`);
			}
		} catch (error) {
			navigationError = error instanceof Error ? error.message : 'Navigation error occurred';
			console.error('Navigation error:', error);
		} finally {
			forwardBackward = false;
		}
	});

	// Handle language changes
	$effect(() => {
		if (forwardBackward || !initialLoadComplete) return;

		try {
			if ($collection?.name) {
				goto(`/${$contentLanguage}/${$collection.name}`);
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

	// Update SEO metadata
	$effect(() => {
		if (!browser) return;

		const title = `${$collection?.name || 'Loading...'} - Your Site Title`;
		const description = `View and manage entries for ${$collection?.name || '...'}.`;

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

	// Debug logging for collection value changes
	$effect(() => {
		if (import.meta.env.DEV) {
			console.debug('Page view collectionValue:', $collectionValue);
		}
	});

	// Handle browser history navigation
	function handlePopState() {
		forwardBackward = true;
		const selectedCollection = $collections[$page.params.collection];
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
	});
</script>

<div class="content h-full">
	{#if navigationError}
		<div class="error text-error-500" role="alert">
			{navigationError}
		</div>
	{:else if $collection}
		{#if $mode === 'view' || $mode === 'modify'}
			<EntryList />
		{:else if ['edit', 'create'].includes($mode)}
			<div id="fields_container" class="fields max-h-[calc(100vh-60px)] overflow-y-auto max-md:max-h-[calc(100vh-120px)]">
				<Fields fields={$collection.fields} fieldsData={$collection.fields} customData={$collectionValue} root={false} />
			</div>
		{:else if $mode === 'media' && $page.params.collection}
			<MediaGallery />
		{/if}
	{:else}
		<div class="error text-error-500" role="alert">Error: Collection data not available.</div>
	{/if}
</div>
