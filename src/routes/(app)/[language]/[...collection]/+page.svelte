<!--
@file src/routes/(app)/[language]/[...collection]/+page.svelte
@component
**This component acts as a layout and data router for the collection view.**

## Features:
- Receives all page data (schema, entries, pagination) from the server-side `load` function.
- Passes server-loaded data as props to the `EntryList` or `Fields` components.
- Does not perform any client-side data fetching.
- Auto-saves unsaved changes as draft when navigating away to prevent data loss.
-->
<script lang="ts">
	import { beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { collection, mode, setCollection, collectionValue, setMode } from '@src/stores/collectionStore.svelte';
	import { contentLanguage } from '@stores/store.svelte';
	import EntryList from '@src/components/collectionDisplay/EntryList.svelte';
	import Fields from '@src/components/collectionDisplay/Fields.svelte';
	import Loading from '@src/components/Loading.svelte';
	import { showToast } from '@utils/toast';
	import type { Schema } from '@src/content/types';

	interface PageData {
		collectionSchema: Schema;
		entries: any[];
		pagination: {
			totalItems: number;
			pagesCount: number;
			currentPage: number;
			pageSize: number;
		};
		revisions: any[];
		contentLanguage: string;
	}

	let { data }: { data: PageData } = $props();

	// Use $derived for reactivity from server-loaded data
	let collectionSchema = $derived(data?.collectionSchema);
	let entries = $derived(data?.entries || []);
	let pagination = $derived(data?.pagination || { currentPage: 1, pageSize: 10, totalItems: 0, pagesCount: 1 });
	let revisions = $derived(data?.revisions || []);
	let serverContentLanguage = $derived(data?.contentLanguage);

	// Track initial collectionValue to detect changes
	let initialCollectionValue = $state<string>('');
	let userClickedCancel = $state(false);
	let isSavingDraft = $state(false);

	// Sync contentLanguage store with server data
	$effect(() => {
		if (serverContentLanguage && contentLanguage.value !== serverContentLanguage) {
			contentLanguage.set(serverContentLanguage as any);
		}
	});

	// This effect runs when SvelteKit provides new data from the `load` function
	$effect(() => {
		if (collectionSchema) {
			// Set the global store with the fresh data loaded from the server
			setCollection(collectionSchema);
		}
	});

	// Track initial state when entering edit mode
	$effect(() => {
		if (mode.value === 'edit' && collectionValue.value) {
			initialCollectionValue = JSON.stringify(collectionValue.value);
			userClickedCancel = false; // Reset cancel flag
		}
	});

	// Auto-save draft function
	async function autoSaveDraft(): Promise<boolean> {
		if (isSavingDraft) return false;

		isSavingDraft = true;
		try {
			const entryData = collectionValue.value as any;
			const collectionId = collection.value?._id;
			const tenantId = page.data?.tenantId;

			if (!collectionId || !entryData) {
				return false;
			}

			// Set status to draft for auto-save
			const draftData = {
				...entryData,
				status: 'draft',
				updatedAt: new Date().toISOString()
			};

			// Determine if creating new or updating existing
			const isNewEntry = !entryData._id;
			const endpoint = isNewEntry ? `/api/collections/${collectionId}` : `/api/collections/${collectionId}/${entryData._id}`;

			const method = isNewEntry ? 'POST' : 'PUT';

			const response = await fetch(endpoint, {
				method,
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					data: draftData,
					tenantId
				})
			});

			if (response.ok) {
				const result = await response.json();

				// Update collectionValue with the saved draft (including _id for new entries)
				if (isNewEntry && result.data?._id) {
					collectionValue.value = { ...draftData, _id: result.data._id };
				}

				console.log('[Auto-save] Draft saved successfully');
				return true;
			} else {
				console.error('[Auto-save] Failed to save draft:', response.statusText);
				return false;
			}
		} catch (error) {
			console.error('[Auto-save] Error saving draft:', error);
			return false;
		} finally {
			isSavingDraft = false;
		}
	}

	// Listen for cancel button clicks
	$effect(() => {
		const handleCancelClick = (event: CustomEvent) => {
			userClickedCancel = true;
			console.log('[Auto-save] Cancel clicked - no draft will be saved');
		};

		document.addEventListener('cancelEdit' as any, handleCancelClick as EventListener);
		return () => {
			document.removeEventListener('cancelEdit' as any, handleCancelClick as EventListener);
		};
	});

	// Navigation guard: auto-save draft if changes exist
	beforeNavigate(async ({ cancel }) => {
		// Skip if user clicked cancel button
		if (userClickedCancel) {
			console.log('[Auto-save] Skipping auto-save due to cancel');
			userClickedCancel = false;
			return;
		}

		// Only check if we're in edit/create mode and have unsaved changes
		if (['edit', 'create'].includes(mode.value) && collectionValue.value) {
			const currentValue = JSON.stringify(collectionValue.value);
			const hasUnsavedChanges = currentValue !== initialCollectionValue;

			if (hasUnsavedChanges && !isSavingDraft) {
				console.log('[Auto-save] Detected unsaved changes, auto-saving as draft...');

				// Cancel navigation temporarily
				cancel();

				// Auto-save as draft
				const saved = await autoSaveDraft();

				if (saved) {
					showToast('Changes auto-saved as draft', 'success');
					// Update initial value to prevent re-saving
					initialCollectionValue = JSON.stringify(collectionValue.value);
					// Allow navigation to continue
					setMode('view');
				} else {
					showToast('Failed to auto-save. Please save manually.', 'error');
				}
			}
		}
	});
</script>

<svelte:head>
	<title>{collectionSchema?.name ?? 'Collection'} - SveltyCMS</title>
</svelte:head>

<div class="content h-full">
	<!-- Auto-save indicator -->
	{#if isSavingDraft}
		<div class="fixed right-4 top-20 z-50 flex items-center gap-2 rounded-lg bg-warning-500 px-4 py-2 text-white shadow-lg">
			<div class="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
			<span class="text-sm font-medium">Auto-saving draft...</span>
		</div>
	{/if}

	{#if !collection.value}
		<!-- This should only flash briefly on first load -->
		<Loading />
	{:else if mode.value === 'view' || mode.value === 'modify'}
		<!-- Pass the server-loaded data directly as props -->
		<EntryList {entries} {pagination} />
	{:else if ['edit', 'create'].includes(mode.value)}
		<div id="fields_container" class="fields max-h-[calc(100vh-100px)] overflow-y-auto overflow-x-visible max-md:max-h-[calc(100vh-120px)]">
			<!-- Pass the server-loaded data directly as props -->
			<Fields fields={collection.value.fields} {revisions} contentLanguage={serverContentLanguage} />
		</div>
	{/if}
</div>
