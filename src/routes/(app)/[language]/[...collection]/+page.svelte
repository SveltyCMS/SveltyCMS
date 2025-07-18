<!-- 
@file src/routes/(app)/[language]/[collection]/+page.svelte  
@component
**This component handles the content and logic for a specific page within the application**

Features:
It dynamically fetches and displays data based on the current language and collection route parameters. 
It also handles navigation, mode switching (view, edit, create, media), and SEO metadata for the page.
-->
<script lang="ts">
	import { publicEnv } from '@root/config/public';

	// Types
	import type { User } from '@src/auth/types';
	import type { Schema } from '@src/content/types';
	// ParaglideJS
	import type { Locale } from '@src/paraglide/runtime';

	// Stores
	import { page } from '$app/state';
	import { collection, collectionValue, mode } from '@root/src/stores/collectionStore.svelte';
	import { contentLanguage } from '@stores/store.svelte';
	// Components
	import Fields from '@components/Fields.svelte';
	import Loading from '@root/src/components/Loading.svelte';
	import EntryList from '@src/components/EntryList.svelte';

	interface Props {
		data: {
			collection: Schema & { module: string | undefined };
			contentLanguage: string;
			user: User;
		};
	}

	const { data }: Props = $props();

	const shouldFetchData = data.collection.name && (!collection.value || data.collection.path !== collection.value.path);

	let isLoading = $state(shouldFetchData);

	async function loadCollection() {
		isLoading = true;
		if (!page.params.collection) return;

		collection.set(data.collection);
		isLoading = false;
	}

	$effect(() => {
		// Correctly using $effect here
		if (data.collection.name && (!collection.value || data.collection.path !== collection.value.path)) {
			console.log('[PAGE DEBUG] Collection loading effect:', {
				dataCollectionName: data.collection.name,
				dataCollectionPath: data.collection.path,
				dataCollectionId: data.collection._id,
				currentCollectionPath: collection.value?.path,
				currentCollectionName: collection.value?.name,
				shouldLoad: true
			});
			loadCollection();
		}
	});

	// Track if language was set by user to avoid overriding user selection
	let userInitiatedLanguageChange = $state(false);
	let lastUrlLanguage = $state(data.contentLanguage);

	// Listen for user-initiated language changes
	$effect(() => {
		const handleLanguageChange = (event: CustomEvent) => {
			console.log('[PAGE DEBUG] User-initiated language change detected:', event.detail.language);
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
			console.log('[PAGE DEBUG] URL language changed from', lastUrlLanguage, 'to', data.contentLanguage, '- resetting user flag');
			userInitiatedLanguageChange = false;
			lastUrlLanguage = data.contentLanguage;
		}

		// Only set language from URL if user hasn't initiated a language change
		if (!userInitiatedLanguageChange) {
			if (!(publicEnv.AVAILABLE_CONTENT_LANGUAGES as ReadonlyArray<Locale>).includes(data.contentLanguage as Locale)) {
				// If data.contentLanguage is invalid and contentLanguage is not already set to a valid value, fall back to 'en'
				if (!contentLanguage.value || !(publicEnv.AVAILABLE_CONTENT_LANGUAGES as ReadonlyArray<Locale>).includes(contentLanguage.value)) {
					console.log('[PAGE DEBUG] Setting invalid language fallback to en');
					contentLanguage.set('en');
				}
			} else {
				console.log('[PAGE DEBUG] Setting language from URL data:', data.contentLanguage);
				contentLanguage.set(data.contentLanguage as Locale);
			}
		} else {
			console.log('[PAGE DEBUG] Skipping language set from URL due to user-initiated change');
		}
	});

	// Handle language changes - TEMPORARILY DISABLED TO FIX BOOT LOOP
	// $effect(() => {
	// 	if (!collection?.value?.name && !collection.value?.path) return;

	// 	const newLanguage = contentLanguage.value;
	// 	const currentPath = page.url.pathname;
	// 	const newPath = `/${newLanguage}${collection.value?.path?.toString()}`;

	// 	console.log('[PAGE DEBUG] Language change effect:', {
	// 		currentPath,
	// 		newPath,
	// 		collectionPath: collection.value?.path,
	// 		collectionName: collection.value?.name,
	// 		language: newLanguage
	// 	});

	// 	if (currentPath !== newPath) {
	// 		console.log('[PAGE DEBUG] Navigating from', currentPath, 'to', newPath);
	// 		goto(newPath);
	// 	}
	// });

	$effect(() => {
		if (mode.value === 'media') {
			mode.set('view');
		}
	});

	// Handle browser history navigation
</script>

<svelte:head>
	<title>{collection.value?.name?.toString() ?? 'Collection Not found'} - Your Site Title</title>
	<meta name="description" content={`View and manage entries for ${collection.value?.name?.toString()}.`} />
</svelte:head>
<div class="content h-full">
	{#if isLoading}
		<div class="loading flex h-full items-center justify-center">
			<Loading />
		</div>
	{:else if collection.value}
		{#if mode.value === 'view' || mode.value === 'modify'}
			<EntryList />
		{:else if ['edit', 'create'].includes(mode.value)}
			<div id="fields_container" class="fields max-h-[calc(100vh-60px)] overflow-y-auto max-md:max-h-[calc(100vh-120px)]">
				<Fields fields={collection.value.fields} fieldsData={collectionValue.value} customData={{}} root={true} />
			</div>
		{/if}
	{:else}
		<div class="error text-error-500" role="alert">Error: Collection data not available.</div>
	{/if}
</div>
