<!-- 
 @file src/routes/(app)/config/collection/+page.svelte
 @description This component sets up and displays the collection page. It provides a user-friendly interface for creating, editing, and deleting collections.
-->

<script lang="ts">
	import { goto } from '$app/navigation';

	// Stores
	import { categories, collectionValue, mode, unAssigned } from '@stores/collectionStore';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import Unassigned from './[...collectionName]/Unassigned.svelte';
	import Board from './Board.svelte';
	import ModalCategory from './ModalCategory.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getToastStore, getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Export the data prop
	export let data;

	// Modal Trigger - New Category
	function modalAddCategory(): void {
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ModalCategory,

			// Provide default slot content as a template literal
			slot: '<p>Edit Form</p>'
		};
		const d: ModalSettings = {
			type: 'component',
			title: 'Add New Category',
			body: 'Enter Unique Name and an Icon for your new category column',
			component: modalComponent,
			response: (r: any) => {
				if (r) {
					availableCollection = [
						...availableCollection,
						{
							id: r.newCategoryName.toLowerCase().replace(/\s/g, '-'),
							name: r.newCategoryName,
							icon: r.newCategoryIcon,
							items: []
						}
					];
					console.log('response:', r);
				}
			}
		};
		modalStore.trigger(d);
	}

	function handleAddCollectionClick() {
		mode.set('create');
		collectionValue.set({
			name: 'new',
			icon: '',
			description: '',
			status: 'unpublished',
			slug: '',
			fields: []
		});
		// Navigate to the route where you handle creating new collections
		goto('/config/collectionbuilder/new');
	}

	// Define the structure of an unassigned collection
	$: UnassignedCollections = $unAssigned.map((collection) => ({
		id: crypto.randomUUID(),
		name: collection.name,
		icon: collection.icon,
		items: $unAssigned.map((collection: any) => ({
			id: crypto.randomUUID(),
			name: collection.name,
			icon: collection.icon,
			collections: collection
		}))
	}));

	// Define the structure of an Assigned collection
	$: availableCollection = $categories.map((category) => ({
		id: crypto.randomUUID(),
		name: category.name,
		icon: category.icon,
		items: category.collections.map((collection: any) => ({
			id: crypto.randomUUID(),
			name: collection.name,
			icon: collection.icon,
			collections: collection
		}))
	}));

	// Update the Assigned collection(s) where the item was dropped
	function handleBoardUpdated(newColumnsData: any) {
		availableCollection = newColumnsData;
	}

	// Update the Unassigned collection where the item was dropped
	function handleUnassignedUpdated(newItems: any) {
		UnassignedCollections = newItems;
	}

	// Saving changes to the config.ts
	async function handleSaveClick() {
		try {
			const response = await fetch('/api/updateConfig', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(availableCollection)
			});

			if (response.status === 200) {
				showToast('Config file updated successfully', 'success');
			} else if (response.status === 304) {
				// Provide a custom message for 304 status
				showToast('No changes detected, config file not updated', 'info');
			} else {
				const responseText = await response.text();
				showToast(`Error updating config file: ${responseText}`, 'error');
			}
		} catch (error) {
			showToast('Network error occurred while updating config file', 'error');
		}
	}

	// Show corresponding Toast messages
	function showToast(message, type) {
		const backgrounds = {
			success: 'variant-filled-primary',
			info: 'variant-filled-tertiary',
			error: 'variant-filled-error'
		};
		toastStore.trigger({
			message: message,
			background: backgrounds[type],
			timeout: 3000,
			classes: 'border-1 !rounded-md'
		});
	}
</script>

<!-- Page Title with Back Button -->
<PageTitle name={m.collection_pagetitle()} icon="fluent-mdl2:build-definition" showBackButton={true} backUrl="/config" />

<div class="my-2 flex w-full justify-around gap-2 lg:ml-auto lg:mt-0 lg:w-auto lg:flex-row">
	<!-- add new Category-->
	<button on:click={modalAddCategory} type="button" class="variant-filled-tertiary btn-sm flex items-center justify-between gap-1 rounded font-bold">
		<iconify-icon icon="bi:collection" width="18" class="text-white" />
		{m.collection_addcategory()}
	</button>

	<!-- add new Collection-->
	<button
		on:click={handleAddCollectionClick}
		type="button"
		class="variant-filled-success btn-sm flex items-center justify-between gap-1 rounded font-bold"
	>
		<iconify-icon icon="material-symbols:category" width="18" class="text-white" />
		{m.collection_addcollection()}
	</button>

	<button type="button" on:click={handleSaveClick} class="variant-filled-tertiary btn gap-2 !text-white dark:variant-filled-primary lg:ml-4">
		<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
		{m.button_save()}
	</button>
</div>

<div class="max-h-[calc(100vh-65px)] overflow-auto">
	<div class="wrapper mb-2">
		{#if !availableCollection}
			<p class="my-2 text-center">{m.collection_first()}</p>
		{:else}
			<p class="mb-4 text-center dark:text-primary-500">{m.collection_text_description()}</p>

			<!-- display unassigned collections -->
			<Unassigned items={UnassignedCollections} onDrop={handleUnassignedUpdated} />

			<!-- display collections -->
			<Board columns={availableCollection} onFinalUpdate={handleBoardUpdated} />
		{/if}
	</div>
</div>
