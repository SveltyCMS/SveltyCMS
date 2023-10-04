<script lang="ts">
	import { categories, collection, unAssigned } from '@src/stores/store';
	import Unassigned from '../config/Unassigned.svelte';
	import Board from './Board.svelte';
	import { goto } from '$app/navigation';

		// typesafe-i18n
		import LL from '@src/i18n/i18n-svelte'

	//skeleton
	import { getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();
	import ModalCategory from './ModalCategory.svelte';
	import PageTitle from '@src/components/PageTitle.svelte';
	import { generateUniqueId } from '@src/utils/utils';

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
		// Navigate to the route where you handle creating new collections
		goto('/collection/new');
	}

	// Define the structure of an unassigned collection
	let UnassignedCollections = $unAssigned.map((collection) => ({
		id: generateUniqueId(),
		name: collection.name,
		icon: collection.icon,
		items: $unAssigned.map((collection: any, collectionIndex: number) => ({
			id: generateUniqueId(),
			name: collection.name,
			icon: collection.icon
		}))
	}));

	// Define the structure of an Assigned collection
	export let availableCollection = $categories.map((category) => ({
		id: generateUniqueId(),
		name: category.name,
		icon: category.icon,
		items: category.collections.map((collection: any, collectionIndex: number) => ({
			id: generateUniqueId(),
			name: collection.name,
			icon: collection.icon
		}))
	}));

	// Update the Assigned collection(s) where the item was dropped
	function handleBoardUpdated(newColumnsData: any) {
		availableCollection = newColumnsData;
		// console.log('handleBoardUpdated:', availableCollection);
	}

	// Update the Unassigned collection where the item was dropped
	function handleUnassignedUpdated(newItems: any) {
		UnassignedCollections = newItems;
		// console.log('handleUnassignedUpdated:', UnassignedCollections);
	}

	//Saving changes to the config.ts
	async function handleSaveClick() {
		try {
			console.log('availableCollection:', availableCollection);

			// Make a POST request to the /api/updateConfig endpoint with the new data
			const response = await fetch('/api/updateConfig', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(availableCollection)
			});

			// Check if the update was successful
			if (response.ok) {
				console.log('Config file updated successfully');
			} else {
				console.error('Error updating config file');
				const errorDetails = await response.text();
				console.error('Server response:', errorDetails);
			}
		} catch (error) {
			console.error('Error updating config file:', error);
		}
	}
</script>

<div class="mb-2 flex items-center justify-between">
	<PageTitle name="Menu Builder" icon="" />

	<button type="button" on:click={handleSaveClick} class="variant-filled-primary btn gap-2 !text-white">
		<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
		Save
	</button>
</div>

<!-- add an input field and a button here -->
<div class="my-1 ml-1 flex flex-col justify-around gap-1 rounded-sm bg-surface-500 p-2 sm:flex-row">
	<button on:click={modalAddCategory} type="button" class="variant-filled-tertiary btn-sm rounded-md">Add Category</button>
	<!-- add new Collection-->
	<!-- TODO: only show  when Category exists -->
	<button on:click={handleAddCollectionClick} type="button" class="variant-filled-success btn-sm rounded-md">Add Collection</button>
</div>
{#if !availableCollection}
	<p class="my-2 text-center">Create a first collection to get started</p>
{:else}
	<!-- display unassigned collections -->
	<Unassigned items={UnassignedCollections} onDrop={handleUnassignedUpdated} />

	<!-- display collections -->
	<Board columns={availableCollection} onFinalUpdate={handleBoardUpdated} />
{/if}
