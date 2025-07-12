<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/+page.svelte
@component  
**This component sets up and displays the collection page.**
It provides a user-friendly interface for creating, editing, and deleting collections.
-->
<script lang="ts">
	import axios from 'axios';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	import { obj2formData } from '@utils/utils';

	// Stores
	import { page } from '$app/state';
	import { tabSet } from '@stores/store.svelte';
	import { mode, collection } from '@src/stores/collectionStore.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import CollectionWidget from './tabs/CollectionWidget.svelte';
	import CollectionForm from './tabs/CollectionForm.svelte';
	import PageTitle from '@components/PageTitle.svelte';

	// Skeleton
	import { Tab, TabGroup, getToastStore } from '@skeletonlabs/skeleton';
	import { getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';

	import { initializeWidgets } from '@src/widgets';

	// Create local tabSet variable for binding
	let localTabSet = $state(tabSet.value);

	// Sync with store when local value changes
	$effect(() => {
		tabSet.set(localTabSet);
	});

	// Sync local value when store changes
	$effect(() => {
		localTabSet = tabSet.value;
	});

	import type { User } from '@src/auth/types';
	import type { Schema } from '@src/content/types';

	const modalStore = getModalStore();
	const toastStore = getToastStore();

	// Extract the collection name from the URL
	let collectionPath = $state(page.params.contentPath);
	let action = $state(page.params.action);

	interface Props {
		data: {
			collection: Schema & { module: string | undefined };
			contentLanguage: string;
			user: User;
		};
	}

	const { data }: Props = $props();

	$effect(() => {
		// Correctly using $effect here
		if (data.collection?.name && (!collection.value || data.collection.path !== collection.value.path)) {
			loadCollection();
		}
	});

	async function loadCollection() {
		if (action == 'edit') collection.set(data.collection);
		else {
			// Set to null for new collections as _id is required in Schema
			collection.set(null);
			/* Potential alternative if you need a placeholder object:
			collection.set({
				_id: '', // Use an empty string or generate a temporary client-side ID if needed later
				name: '',
				icon: '',
				description: '',
				status: 'unpublished',
				slug: '',
				fields: []
			});
			*/
		}
	}

	// Default widget data (tab1)
	let name = $derived(mode.value == 'edit' ? (collection.value ? collection.value.name : collectionPath) : collectionPath);

	// Page title
	let pageTitle = $state('');
	let highlightedPart = $state('');

	// Effect to update page title based on mode and collection name
	$effect.root(() => {
		// Set the base page title according to the mode
		if (mode.value === 'edit') {
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
		if (mode.value === 'edit') {
			pageTitle = `Edit ${highlightedPart} Collection`;
		} else {
			pageTitle = `Create ${highlightedPart} Collection`;
		}
	}

	// Import validation store
	import { validationStore } from '@src/stores/store.svelte';

	// Function to save data by sending a POST request
	async function handleCollectionSave() {
		console.log(collection.value, name, page.params);

		// Check validation errors before submission
		if (validationStore.errors && Object.keys(validationStore.errors).length > 0) {
			toastStore.trigger({
				message: 'Please fix validation errors before saving',
				background: 'variant-filled-error',
				timeout: 3000
			});
			return;
		}

		// Prepare form data
		const data =
			mode.value == 'edit'
				? obj2formData({
						originalName: collection.value?.name,
						name: name,
						icon: collection.value?.icon,
						status: collection.value?.status,
						slug: collection.value?.slug,
						description: collection.value?.description,
						permissions: collection.value?.permissions,
						fields: collection.value?.fields
					})
				: obj2formData({
						name: name,
						icon: collection.value?.icon,
						status: collection.value?.status,
						slug: collection.value?.slug,
						description: collection.value?.description,
						permissions: collection.value?.permissions,
						fields: collection.value?.fields
					});

		// Send the form data to the server
		const resp = await axios.post(`?/saveCollection`, data, {
			headers: {
				'Content-Type': 'multipart/form-data'
			}
		});

		if (resp.data.status === 200) {
			// Trigger the toast
			const t = {
				message: "Collection Saved. You're all set to build your content.",
				// Provide any utility or variant background style:
				background: 'variant-filled-primary',
				timeout: 3000,
				// Add your custom classes here:
				classes: 'border-1 !rounded-md'
			};
			toastStore.trigger(t);
		}
	}

	function handleCollectionDelete() {
		console.log('Delete collection:', collection.value?.name);
		// Define the confirmation modal
		const confirmModal: ModalSettings = {
			type: 'confirm',
			title: 'Please Confirm',
			body: 'Are you sure you wish to delete this collection?',
			response: (r: boolean) => {
				if (r) {
					// Send the form data to the server
					axios.post(`?/deleteCollections`, obj2formData({ contentTypes: collection.value?.name }), {
						headers: {
							'Content-Type': 'multipart/form-data'
						}
					});

					// Trigger the toast
					const t = {
						message: 'Collection Deleted.',
						// Provide any utility or variant background style:
						background: 'variant-filled-error',
						timeout: 3000,
						// Add your custom classes here:
						classes: 'border-1 !rounded-md'
					};
					toastStore.trigger(t);
					goto(`/collection`);
				} else {
					// User cancelled, do not delete
					console.log('User cancelled deletion.');
				}
			}
		};
		// Trigger the confirmation modal
		modalStore.trigger(confirmModal);
		// Close the modal
	}

	onMount(() => {
		// Set the initial tab
		initializeWidgets();
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
	{#if mode.value == 'edit'}
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
	<TabGroup bind:group={localTabSet}>
		<!-- User Permissions -->
		{#if page.data.user && page.data.user.isAdmin}
			<!-- Edit -->
			<Tab bind:group={localTabSet} name="default" value={0}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="ic:baseline-edit" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					<span class:active={tabSet.value === 0} class:text-tertiary-500={tabSet.value === 0} class:text-primary-500={tabSet.value === 0}
						>{m.button_edit()}</span
					>
				</div>
			</Tab>

			<!-- Widget Fields -->
			<Tab bind:group={localTabSet} name="widget" value={1}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:widgets-outline" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					<span class:active={tabSet.value === 1} class:text-tertiary-500={tabSet.value === 2} class:text-primary-500={tabSet.value === 2}
						>{m.collection_widgetfields()}</span
					>
				</div>
			</Tab>
		{/if}

		<!-- Tab Panels -->
		{#if tabSet.value === 0}
			<CollectionForm data={collection.value} {handlePageTitleUpdate} />
		{:else if tabSet.value === 1}
			<CollectionWidget fields={collection.value?.fields} {handleCollectionSave} />
		{/if}
	</TabGroup>
</div>
