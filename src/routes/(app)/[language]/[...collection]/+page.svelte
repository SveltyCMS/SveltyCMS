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
	import { browser } from '$app/environment';
	

	// Stores
	import { page } from '$app/stores';
	import { contentLanguage } from '@stores/store';
	import { collection, collectionValue, mode} from '@root/src/stores/collectionStore.svelte';

	// Components
	import Fields from '@components/Fields.svelte';
	import EntryList from '@components/EntryList.svelte';
	import MediaGallery from '@src/routes/(app)/mediagallery/+page.svelte';

	// System Logger
	import { logger } from '@utils/logger.svelte';
	import type { User } from '@root/src/auth/types.js';
	import { deserializeCollection } from '@root/src/utils/serialize';
  

  interface Props {
    data: { collection: string, language: string, user: User }
  }
  const {data}: Props = $props();

	let forwardBackward = $state(false);
	let initialLoadComplete = $state(false);
	let navigationError = $state<string | null>(null);
	let currentCollectionName = $state<string | undefined>(undefined);
	let currentLanguage = $state<string | undefined>(undefined);
	let isLoading = $state(true);
  

	// Initialize collection
	async function initializeCollection() {
		if (!$page.params.collection) return;

		try {
			// Wait for Content Manager initialization
			 

			const selectedCollection = deserializeCollection(data.collection);
      console.log('selectedCollection', selectedCollection);
			// console.log('selectedCollection', selectedCollection, $page.params.collection);
			if (selectedCollection) {
				collection.set(selectedCollection);
				initialLoadComplete = true;
				navigationError = null;
				currentCollectionName = selectedCollection.id?.toString();
				currentLanguage = contentLanguage.value;
			} else if (initialLoadComplete) {
				navigationError = `Collection not found: ${$page.params.collection}`;
				logger.error(navigationError);
				goto('/404');
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			navigationError = `Failed to initialize collection: ${errorMessage}`;
			logger.error('Collection initialization failed:', { error: errorMessage });
		} finally {
			isLoading = false;
		}
	}

	// Handle browser events with cleanup
	$effect(() => {
		if (!browser) return;

		window.addEventListener('popstate', handlePopState);
		if(!initialLoadComplete) initializeCollection();

		return () => {
			window.removeEventListener('popstate', handlePopState);
		};
	});

	// Handle collection changes
	$effect(() => {
		if (!initialLoadComplete || !collection?.value?.name) return;

		const newCollectionName = collection.value.id.toString();
		if (newCollectionName === currentCollectionName) return;

		currentCollectionName = newCollectionName;
		if (!forwardBackward) {
			forwardBackward = true;
			goto(`/${contentLanguage.value}${collection.value.path.toString()}`).then(() => {
				forwardBackward = false;
			});
		}
	});

	// Handle language changes
	$effect(() => {
		if (!initialLoadComplete || !collection?.value?.name) return;

		const newLanguage = contentLanguage.value;
		if (newLanguage === currentLanguage) return;

		currentLanguage = newLanguage;
		goto(`/${newLanguage}${collection.value.path.toString()}`);
	});

	// Handle browser history navigation
	function handlePopState() {
		forwardBackward = true;
		initializeCollection();
	}

	// Update SEO metadata
	$effect(() => {
		if (!browser || !collection?.value?.name) return;

		const title = `${collection.value.name.toString()} - Your Site Title`;
		const description = `View and manage entries for ${collection.value.name.toString()}.`;

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
</script>

<div class="content h-full">
	{#if isLoading}
		<div class="loading flex h-full items-center justify-center">
			<span class="loading-spinner">Loading...</span>
		</div>
	{:else if navigationError}
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
