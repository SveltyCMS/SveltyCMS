<!--
@file src/routes/(app)/[language]/[collection]/+page.svelte
@component
**This component handles the content and logic for a specific page within the application**

## Features:
It dynamically fetches and displays data based on the current language and collection route parameters.
It also handles navigation, mode switching (view, edit, create, media), and SEO metadata for the page.
-->

<script lang="ts">
	// Types
	import type { User } from '@src/databases/auth/types';
	import type { Schema } from '@src/content/types';
	// ParaglideJS
	import type { Locale } from '@src/paraglide/runtime';

	// Stores
	import { page } from '$app/state';
	import { collection, collectionValue, mode, setCollection, setCollectionValue, setMode } from '@stores/collectionStore.svelte';
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';
	import { contentLanguage } from '@stores/store.svelte';
	import { logger } from '@utils/logger.svelte';
	// Components
	import Loading from '@components/Loading.svelte';
	import EntryList from '@components/collectionDisplay/EntryList.svelte';
	import Fields from '@components/collectionDisplay/Fields.svelte';

	interface Props {
		data: {
			collection: Schema & { module: string | undefined };
			contentLanguage: string;
			user: User;
			siteName: string;
		};
	}

	const { data }: Props = $props();

	// Track last language from URL and user-initiated language changes
	let lastUrlLanguage = data?.contentLanguage ?? 'en';
	let userInitiatedLanguageChange = false;

	const shouldFetchData = data.collection.name && (!collection.value || data.collection.path !== collection.value.path);

	let isLoading = $state(shouldFetchData);

	async function loadCollection() {
		globalLoadingStore.startLoading(loadingOperations.navigation);
		isLoading = true;
		if (!page.params.collection) {
			globalLoadingStore.stopLoading(loadingOperations.navigation);
			return;
		}

		setCollection(data.collection);

		// Initialize collectionValue with language keys
		const initialValue: Record<string, any> = {
			_id: (collectionValue as any)?._id,
			slug: (collectionValue as any)?.slug
		};
		setCollectionValue(initialValue);

		setMode('view'); // Set mode to view to render EntryList
		isLoading = false;
		globalLoadingStore.stopLoading(loadingOperations.navigation);
	}

	$effect(() => {
		// Correctly using $effect here
		if (data.collection.name && (!collection.value || data.collection.path !== collection.value.path)) {
			loadCollection();
		} else if (data.collection.name && collection.value) {
			// Collection already loaded - ensure mode is correct for collection view
			if (mode.value === 'media' || mode.value === 'modify') {
				logger.debug(`Collection already loaded, but mode is ${mode.value}, setting to view`);
				setMode('view');
			}
		}
	});

	$effect(() => {
		const handleLanguageChange = (_event: CustomEvent) => {
			// console.log('[PAGE DEBUG] User-initiated language change detected:', _event.detail.language);
			userInitiatedLanguageChange = true;
		};

		if (typeof window !== 'undefined') {
			window.addEventListener('languageChanged', handleLanguageChange as EventListener);
			return () => {
				window.removeEventListener('languageChanged', handleLanguageChange as EventListener);
			};
		}
	});

	$effect(() => {
		// Reset the flag if the URL language has actually changed (navigation)
		if (data.contentLanguage !== lastUrlLanguage) {
			// console.log('[PAGE DEBUG] URL language changed from', lastUrlLanguage, 'to', data.contentLanguage, '- resetting user flag');
			userInitiatedLanguageChange = false;
			lastUrlLanguage = data.contentLanguage;
		}

		// Only set language from URL if user hasn't initiated a language change
		if (!userInitiatedLanguageChange) {
			const availableContentLanguages = publicEnv.AVAILABLE_CONTENT_LANGUAGES || ['en'];
			if (!(availableContentLanguages as ReadonlyArray<Locale>).includes(data.contentLanguage as Locale)) {
				// If data.contentLanguage is invalid and contentLanguage is not already set to a valid value, fall back to 'en'
				if (!contentLanguage.value || !(availableContentLanguages as ReadonlyArray<Locale>).includes(contentLanguage.value)) {
					console.log('[PAGE DEBUG] Setting invalid language fallback to en');
					contentLanguage.set('en');
				}
			} else {
				contentLanguage.set(data.contentLanguage as Locale);
			}
		}
	});
	$effect(() => {
		if (mode.value === 'media') {
			setMode('view');
		}
	});

	// Handle browser history navigation
</script>

<svelte:head>
	<title>{collection.value?.name?.toString() ?? 'Collection Not found'} - {data.siteName}</title>
	<meta name="description" content={`View and manage entries for ${collection.value?.name?.toString()}.`} />
</svelte:head>
<div class="content h-full">
	{#if isLoading}
		<Loading />
	{:else if collection.value}
		{#if mode.value === 'view' || mode.value === 'modify'}
			<EntryList />
		{:else if ['edit', 'create'].includes(mode.value)}
			<div id="fields_container" class="fields max-h-[calc(100vh-100px)] overflow-y-auto max-md:max-h-[calc(100vh-120px)]">
				<Fields fields={collection.value.fields} />
			</div>
		{/if}
	{:else}
		<div class="error text-error-500" role="alert">Error: Collection data not available.</div>
	{/if}
</div>
