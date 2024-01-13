<script lang="ts">
	import { categories, unAssigned } from '@stores/store';
	import Unassigned from './[...collectionName]/Unassigned.svelte';
	import Board from './Board.svelte';
	import { goto } from '$app/navigation';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	//skeleton
	import { getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();
	import ModalCategory from './ModalCategory.svelte';
	import PageTitle from '@components/PageTitle.svelte';
	import { generateUniqueId } from '@utils/utils';

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
	$: UnassignedCollections = $unAssigned.map((collection) => ({
		id: generateUniqueId(),
		name: collection.name,
		icon: collection.icon,
		items: $unAssigned.map((collection: any) => ({
			id: generateUniqueId(),
			name: collection.name,
			icon: collection.icon
		}))
	}));

	// Define the structure of an Assigned collection
	$: availableCollection = $categories.map((category) => ({
		id: generateUniqueId(),
		name: category.name,
		icon: category.icon,
		items: category.collections.map((collection: any) => ({
			id: generateUniqueId(),
			name: collection.name,
			icon: collection.icon
		}))
	}));

	// Update the Assigned collection(s) where the item was dropped
	function handleBoardUpdated(newColumnsData: any) {
		availableCollection = newColumnsData;
		//console.log('handleBoardUpdated:', availableCollection);
	}

	// Update the Unassigned collection where the item was dropped
	function handleUnassignedUpdated(newItems: any) {
		UnassignedCollections = newItems;
		//console.log('handleUnassignedUpdated:', UnassignedCollections);
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

<div class="mb-3 flex items-center justify-between">
	<PageTitle name={m.collection_pagetitle()} icon="" />

	<button type="button" on:click={handleSaveClick} class="variant-filled-primary btn gap-2 !text-white">
		<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
		{m.collection_save()}
	</button>
</div>
<div class="content-container">
	{#if !availableCollection}
		<p class="my-2 text-center">{m.collection_first()}</p>
	{:else}
		<!-- TODO: add sticky top sticky top-0 z-50 -->
		<div class="sticky top-0">
			<!-- Category/Collection buttons -->
			<div class="mb-3 flex flex-col justify-around gap-1 sm:flex-row">
				<!-- add new Category-->
				<button on:click={modalAddCategory} type="button" class="variant-filled-tertiary btn-sm rounded-md">
					{m.collection_addcategory()}
				</button>

				<!-- add new Collection-->
				<button on:click={handleAddCollectionClick} type="button" class="variant-filled-success btn-sm rounded-md">
					{m.collection_addcollection()}
				</button>
			</div>

			<!-- display unassigned collections -->
			<Unassigned items={UnassignedCollections} onDrop={handleUnassignedUpdated} />
		</div>

		<!-- display collections -->
		<Board columns={availableCollection} onFinalUpdate={handleBoardUpdated} />
	{/if}
</div>
