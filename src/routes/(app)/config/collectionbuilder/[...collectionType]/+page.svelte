<!-- 
@files src/routes/(app)/config/collectionbuilder/[...contentTypes]/+page.svelte
@component  
**This component provides a user-friendly interface for creating, editing, and deleting collections.**

@example
<Collection />

### Props
- `collection` {object} - Collection object

### Features
- Displays collection page
-->

<script lang="ts">
	import axios from 'axios';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	import { obj2formData } from '@utils/utils';

	// Stores
	import { page } from '$app/state';
	import { tabSet } from '@stores/store.svelte';
	import { mode, collectionValue } from '@src/stores/collectionStore.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import CollectionWidget from './tabs/CollectionWidget.svelte';
	import CollectionForm from './tabs/CollectionForm.svelte';
	import PageTitle from '@components/PageTitle.svelte';

	// Modals
	import ModalConfirm from '@components/ModalConfirm.svelte';

	// Skeleton
	import { Tab, Tabs } from '@skeletonlabs/skeleton-svelte';
	import { getToastStore } from '@skeletonlabs/skeleton'; // confirm removed as unused

	const toastStore = getToastStore();

	// Extract the collection name from the URL
	const contentTypes = page.params.contentTypes;

	// Default widget data (tab1)
	let name = $state(mode.value == 'edit' ? (collectionValue.value ? collectionValue.value.name : contentTypes) : contentTypes);

	// State for confirmation modal
	let isConfirmOpen = $state(false);

	// Page title
	let pageTitle = $state('');
	let highlightedPart = $state('');

	// Effect to update page title based on mode and collection name
	$effect.root(() => {
		// Set the base page title according to the mode
		if (mode.value === 'edit') {
			pageTitle = `Edit ${contentTypes} Collection`;
		} else if (contentTypes) {
			pageTitle = `Create ${contentTypes} Collection`;
		} else {
			pageTitle = 'Create new Collection';
		}

		// Ensure the highlighted part (e.g., contentTypes) is unique in the title
		highlightedPart = contentTypes || 'new';

		// Avoid repeating the contentTypes if it's already included in the string
		if (pageTitle.includes(highlightedPart)) {
			pageTitle = pageTitle.replace(new RegExp(`\\b${highlightedPart}\\b`, 'g'), highlightedPart);
		}
	});

	// Effect to update name based on mode and collection value
	$effect.root(() => {
		name = mode.value == 'edit' ? (collectionValue.value ? collectionValue.value.name : contentTypes) : page.params.contentTypes;
	});

	function handlePageTitleUpdate(title: string) {
		highlightedPart = title;
		if (mode.value === 'edit') {
			pageTitle = `Edit ${highlightedPart} Collection`;
		} else {
			pageTitle = `Create ${highlightedPart} Collection`;
		}
	}

	// Function to save data by sending a POST request
	async function handleCollectionSave() {
		// Delete key from fields
		if (collectionValue.value && Array.isArray(collectionValue.value.fields)) {
			collectionValue.value.fields.forEach((field: { key?: string }) => {
				delete field.key;
			});
		}

		// Prepare form data
		const data =
			mode.value == 'edit'
				? obj2formData({
						originalName: collectionValue.value?.name,
						contentTypes: name,
						icon: collectionValue.value?.icon,
						status: collectionValue.value?.status,
						slug: collectionValue.value?.slug,
						description: collectionValue.value?.description,
						permissions: collectionValue.value?.permissions,
						fields: collectionValue.value?.fields
					})
				: obj2formData({
						contentTypes: name,
						icon: collectionValue.value?.icon,
						status: collectionValue.value?.status,
						slug: collectionValue.value?.slug,
						description: collectionValue.value?.description,
						permissions: collectionValue.value?.permissions,
						fields: collectionValue.value?.fields
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
				background: 'preset-filled-primary-500',
				timeout: 3000,
				// Add your custom classes here:
				classes: 'border-1 rounded-md!'
			};
			toastStore.trigger(t);
		}
	}

	// Function to open the confirmation modal
	function openDeleteConfirmModal() {
		if (!collectionValue.value?.name) return;
		isConfirmOpen = true;
	}

	// Function to execute the deletion after confirmation
	async function executeDelete() {
		const collectionName = collectionValue.value?.name;
		if (!collectionName) return;

		console.log('Executing confirmed deletion for:', collectionName);
		try {
			// Send the form data to the server
			await axios.post(`?/deleteCollections`, obj2formData({ contentTypes: collectionName }), {
				headers: {
					'Content-Type': 'multipart/form-data'
				}
			});

			// Trigger the toast
			toastStore.trigger({
				message: `Collection "${collectionName}" Deleted.`,
				background: 'preset-filled-error-500',
				timeout: 3000,
				classes: 'border-1 rounded-md!'
			});
			goto(`/collection`); // Navigate away after deletion
		} catch (error) {
			console.error('Error deleting collection:', error);
			toastStore.trigger({
				message: `Error deleting collection "${collectionName}".`,
				background: 'preset-filled-warning-500', // Use warning color for error
				timeout: 5000,
				classes: 'border-1 rounded-md!'
			});
		}
		// No need to manually close modal here, parent handles it via binding
	}

	onMount(() => {
		// Set the initial tab
		tabSet.set(0);
	});
</script>

<!-- Page Title -->
<div class="my-2 flex items-center justify-between gap-2">
	<PageTitle name={pageTitle} highlight={highlightedPart} icon="ic:baseline-build" />

	<!-- Back -->
	<button onclick={() => history.back()} type="button" aria-label="Back" class="preset-outline-primary btn-icon">
		<iconify-icon icon="ri:arrow-left-line" width="20"></iconify-icon>
	</button>
</div>

<!-- Add ModalConfirm instance -->
<ModalConfirm
	bind:open={isConfirmOpen}
	title="Confirm Deletion"
	body={`Are you sure you wish to delete the collection "${collectionValue.value?.name || 'this'}"? This action cannot be undone.`}
	buttonTextConfirm="Delete Collection"
	onConfirm={executeDelete}
	onClose={() => (isConfirmOpen = false)}
/>

{#if mode.value == 'edit'}
	<div class="flex justify-center gap-3">
		<button
			type="button"
			onclick={openDeleteConfirmModal}
			class=" preset-filled-error-500 btn dark:preset-filled-error-500 mt-1 mr-1 mb-3 justify-end dark:text-black"
			>{m.button_delete()}
		</button>
		<button
			type="button"
			onclick={handleCollectionSave}
			class="preset-filled-tertiary-500 btn dark:preset-filled-tertiary-500 mt-1 mr-1 mb-3 justify-end dark:text-black">{m.button_save()}</button
		>
	</div>
{/if}

<div class="wrapper">
	<p class="text-tertiary-500 dark:text-primary-500 mb-2 hidden text-center sm:block">{m.collection_helptext()}</p>

	<!-- Correct Tabs binding - Cast number to string -->
	<Tabs bind:value={$tabSet} justify="justify-around">
		<!-- User Permissions -->
		{#if page.data.user && page.data.user.isAdmin}
			<!-- Edit -->
			<!-- Remove bind:group from Tab -->
			<Tab name="default" value={0}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="ic:baseline-edit" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					<span class:active={$tabSet === 0} class:text-tertiary-500={$tabSet === 0} class:text-primary-500={$tabSet === 0}>{m.button_edit()}</span>
				</div>
			</Tab>

			<!-- Widget Fields -->
			<!-- Remove bind:group from Tab -->
			<Tab name="widget" value={1}>
				<div class="flex items-center gap-1">
					<iconify-icon icon="mdi:widgets-outline" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
					<span class:active={$tabSet === 1} class:text-tertiary-500={$tabSet === 1} class:text-primary-500={$tabSet === 1}>
						<!-- Removed stray comment -->
						{m.collection_widgetfields()}
					</span>
				</div>
			</Tab>
		{/if}

		<!-- Tab Panels -->
		{#if $tabSet === 0}
			<!-- Pass page data to CollectionForm -->
			<CollectionForm {handlePageTitleUpdate} data={page.data} />
		{:else if $tabSet === 1}
			<CollectionWidget {handleCollectionSave} />
		{/if}
	</Tabs>
</div>
