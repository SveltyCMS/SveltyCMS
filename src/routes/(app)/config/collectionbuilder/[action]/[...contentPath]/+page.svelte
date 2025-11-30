<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/+page.svelte
@component  
**This component sets up and displays the collection page.**

It provides a user-friendly interface for creating, editing, and deleting collections.

### Props
- `data`: An object containing:
- `collection`: The collection schema data (if editing an existing collection).
- `contentLanguage`: The current content language setting.
- `user`: The authenticated user information.

### Features
- Dynamically sets the page title based on whether the user is creating a new collection or editing an existing one.
- Loads collection data when editing, and initializes state accordingly.
- Provides tabs for editing collection forms and widget fields.
-->

<script lang="ts">
	import { logger } from '@utils/logger';
	import axios from 'axios';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	import { obj2formData } from '@utils/utils';

	// Stores
	import { page } from '$app/state';
	import { tabSet } from '@stores/store.svelte';
	import { collection, setCollection } from '@src/stores/collectionStore.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import CollectionWidget from './tabs/CollectionWidget.svelte';
	import CollectionForm from './tabs/CollectionForm.svelte';
	import PageTitle from '@components/PageTitle.svelte';

	// Skeleton v4 components
	import { Tabs } from '@skeletonlabs/skeleton-svelte';
	import { getModalStore, type ModalSettings } from '@utils/modalUtils';
	import { showToast } from '@utils/toast';

	import { widgetStoreActions } from '@stores/widgetStore.svelte';

	// Create local tab variable for binding
	let activeTab = $state('default');

	// Sync with store when local value changes
	$effect(() => {
		tabSet.set(activeTab === 'default' ? 0 : 1);
	});

	// Sync local value when store changes
	$effect(() => {
		activeTab = tabSet.value === 0 ? 'default' : 'widget';
	});

	import type { User } from '@src/databases/auth/types';
	import type { FieldInstance, Schema } from '@src/content/types';

	const modalStore = getModalStore();

	// Extract the collection name from the URL
	let collectionPath = $state(page.params.contentPath);
	const action = $state(page.params.action);

	interface Props {
		data: {
			collection?: Schema;
			contentLanguage: string;
			user: User;
		};
	}

	const { data }: Props = $props();

	let originalName = $state('');
	onMount(() => {
		if (action === 'edit') {
			loadCollection();
		} else {
			setCollection(null);
			originalName = '';
		}
	});

	function loadCollection() {
		if (data.collection) {
			setCollection(data.collection);
			originalName = String(data.collection.name || '');
		} else {
			logger.error('Collection data not found for editing.');
			// Optionally, redirect or show a proper error message
		}
	}

	// Default widget data (tab1)
	// Unwrap the `collection` store value for TS and template usage
	const collectionValue = $derived(collection.value);

	// Page title
	let pageTitle = $state('');
	let highlightedPart = $state('');

	// Effect to update page title based on action and collection name
	$effect.root(() => {
		// Set the base page title according to the action
		if (action === 'edit') {
			pageTitle = `Edit ${collectionPath} Collection`;
		} else if (collectionPath) {
			pageTitle = `Create ${collectionPath} Collection`;
		} else {
			pageTitle = 'Create new Collection';
		}

		// Ensure the highlighted part (e.g., contentTypes) is unique in the title
		highlightedPart = collectionPath || 'new';

		// Avoid repeating the contentTypes if it's already included in the string
		if (pageTitle.includes(highlightedPart)) {
			pageTitle = pageTitle.replace(new RegExp(`\\b${highlightedPart}\\b`, 'g'), highlightedPart);
		}
	});

	function handlePageTitleUpdate(title: string) {
		highlightedPart = title;
		collectionPath = title;
		if (action === 'edit') {
			pageTitle = `Edit ${highlightedPart} Collection`;
		} else {
			pageTitle = `Create ${highlightedPart} Collection`;
		}
	}

	// Import validation store
	import { validationStore } from '@src/stores/store.svelte';

	// Function to save data by sending a POST request
	async function handleCollectionSave() {
		const currentCollection = collection.value;
		const currentName = String(currentCollection?.name || '');

		// Check validation errors before submission
		if (validationStore.errors && Object.keys(validationStore.errors).length > 0) {
			showToast('Please fix validation errors before saving', 'error');
			return;
		}

		// Prepare form data
		const data =
			action == 'edit'
				? obj2formData({
						originalName: originalName,
						name: currentName,
						icon: currentCollection?.icon,
						status: currentCollection?.status,
						slug: currentCollection?.slug,
						description: currentCollection?.description,
						permissions: currentCollection?.permissions,
						fields: currentCollection?.fields
					})
				: obj2formData({
						name: currentName,
						icon: currentCollection?.icon,
						status: currentCollection?.status,
						slug: currentCollection?.slug,
						description: currentCollection?.description,
						permissions: currentCollection?.permissions,
						fields: currentCollection?.fields
					});

		// Send the form data to the server
		const resp = await axios.post(`?/saveCollection`, data, {
			headers: {
				'Content-Type': 'multipart/form-data'
			}
		});

		if (resp.data.status === 200) {
			showToast("Collection Saved. You're all set to build your content.", 'success');
			if (originalName && originalName !== currentName && currentName) {
				const newPath = page.url.pathname.replace(originalName, currentName);
				goto(newPath);
			}
		}
	}

	function handleCollectionDelete() {
		const currentCollection = collection.value;
		// Define the confirmation modal
		const confirmModal: ModalSettings = {
			type: 'confirm',
			title: 'Please Confirm',
			body: 'Are you sure you wish to delete this collection?',
			response: (r: boolean) => {
				if (r) {
					// Send the form data to the server
					axios.post(`?/deleteCollections`, obj2formData({ contentTypes: String(currentCollection?.name || '') }), {
						headers: {
							'Content-Type': 'multipart/form-data'
						}
					});

					// Notify via global toast helper
					showToast('Collection Deleted.', 'error');
					goto(`/collection`);
				} else {
					// User cancelled, do not delete
					logger.debug('User cancelled deletion.');
				}
			}
		};
		// Trigger the confirmation modal
		modalStore.trigger(confirmModal);
		// Close the modal
	}

	onMount(() => {
		// Set the initial tab
		widgetStoreActions.initializeWidgets();
		tabSet.set(0);
	});
</script>

<!-- Page Title -->
<div class="my-2 flex items-center justify-between gap-2">
	<PageTitle name={pageTitle} highlight={highlightedPart} icon="ic:baseline-build" />

	<!-- Back -->
	<button onclick={() => history.back()} type="button" aria-label="Back" class="variant-outline-primary btn-icon">
		<iconify-icon icon="ri:arrow-left-line" width="20"></iconify-icon>
	</button>
</div>

<div class="wrapper">
	{#if action == 'edit'}
		<div class="flex justify-center gap-3">
			<button
				type="button"
				onclick={handleCollectionDelete}
				class=" variant-filled-error btn mb-3 mr-1 mt-1 justify-end dark:variant-filled-error dark:text-black"
				>{m.button_delete()}
			</button>
			<button
				type="button"
				onclick={handleCollectionSave}
				class="variant-filled-tertiary btn mb-3 mr-1 mt-1 justify-end dark:variant-filled-tertiary dark:text-black">{m.button_save()}</button
			>
		</div>
	{/if}

	<p class="mb-2 hidden text-center text-tertiary-500 dark:text-primary-500 sm:block">
		{m.collection_helptext()}
	</p>
	<!-- Required Text  -->
	<div class="mb-2 text-center text-xs text-error-500">* {m.collection_required()}</div>
	<Tabs value={activeTab} onValueChange={(details) => activeTab = details.value}>
		<Tabs.List>
			<!-- User Permissions -->
			{#if page.data.isAdmin}
				<!-- Edit -->
				<Tabs.Trigger value="default">
					<div class="flex items-center gap-1">
						<iconify-icon icon="ic:baseline-edit" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						<span class:active={activeTab === 'default'} class:text-tertiary-500={activeTab === 'default'} class:text-primary-500={activeTab === 'default'}
							>{m.button_edit()}</span
						>
					</div>
				</Tabs.Trigger>

				<!-- Widget Fields -->
				<Tabs.Trigger value="widget">
					<div class="flex items-center gap-1">
						<iconify-icon icon="mdi:widgets-outline" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						<span class:active={activeTab === 'widget'} class:text-tertiary-500={activeTab === 'widget'} class:text-primary-500={activeTab === 'widget'}
							>{m.collection_widgetfields()}</span
						>
					</div>
				</Tabs.Trigger>
			{/if}
		</Tabs.List>

		<!-- Tab Panels -->
		<Tabs.Content value="default">
			<CollectionForm data={collectionValue} {handlePageTitleUpdate} />
		</Tabs.Content>
		<Tabs.Content value="widget">
			<CollectionWidget fields={collectionValue?.fields as FieldInstance[] | undefined} {handleCollectionSave} />
		</Tabs.Content>
	</Tabs>
</div>
