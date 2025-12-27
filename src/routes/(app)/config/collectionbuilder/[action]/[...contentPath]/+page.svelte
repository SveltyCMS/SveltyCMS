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
	import { app } from '@stores/store.svelte';
	import { collections } from '@src/stores/collectionStore.svelte';
	import { ui } from '@src/stores/UIStore.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import CollectionWidget from './tabs/CollectionWidget.svelte';
	import CollectionForm from './tabs/CollectionForm.svelte';
	import PageTitle from '@components/PageTitle.svelte';

	// Skeleton
	import { Tab, TabGroup } from '@skeletonlabs/skeleton';
	import { getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';
	import { showToast } from '@utils/toast';

	import { widgets } from '@stores/widgetStore.svelte';

	// Create local tabSet variable for binding
	let localTabSet = $state(app.tabSetState);

	// Sync with store when local value changes
	$effect(() => {
		app.tabSetState = localTabSet;
	});

	// Sync local value when store changes
	$effect(() => {
		localTabSet = app.tabSetState;
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
			collections.setCollection(null);
			originalName = '';
		}
	});

	function loadCollection() {
		if (data.collection) {
			collections.setCollection(data.collection);
			originalName = String(data.collection.name || '');
		} else {
			logger.error('Collection data not found for editing.');
			// Optionally, redirect or show a proper error message
		}
	}

	// Default widget data (tab1)
	// Unwrap the `collection` store value for TS and template usage
	const collectionActive = $derived(collections.active);

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
		const currentCollection = collections.active;
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
		const currentCollection = collections.active;
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
		widgets.initialize();
		app.tabSetState = 0;
	});

	$effect(() => {
		ui.setRouteContext({ isCollectionBuilder: true });
		return () => ui.setRouteContext({ isCollectionBuilder: false });
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
	<div class="mb-2 text-center text-xs text-error-500" data-testid="required-indicator">* {m.collection_required()}</div>
	<TabGroup bind:group={localTabSet}>
		<!-- User Permissions -->
		{#if page.data.isAdmin}
			<!-- Edit -->
			<Tab bind:group={localTabSet} name="default" value={0}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="ic:baseline-edit" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					<span class:active={app.tabSetState === 0} class:text-tertiary-500={app.tabSetState === 0} class:text-primary-500={app.tabSetState === 0}
						>{m.button_edit()}</span
					>
				</div>
			</Tab>

			<!-- Widget Fields -->
			<Tab bind:group={localTabSet} name="widget" value={1} data-testid="widget-fields-tab">
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:widgets-outline" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					<span class:active={app.tabSetState === 1} class:text-tertiary-500={app.tabSetState === 2} class:text-primary-500={app.tabSetState === 2}
						>{m.collection_widgetfields()}</span
					>
				</div>
			</Tab>
		{/if}

		<!-- Tab Panels -->
		{#if app.tabSetState === 0}
			<CollectionForm data={collectionActive} {handlePageTitleUpdate} />
		{:else if app.tabSetState === 1}
			<CollectionWidget fields={collectionActive?.fields as FieldInstance[] | undefined} {handleCollectionSave} />
		{/if}
	</TabGroup>
</div>
