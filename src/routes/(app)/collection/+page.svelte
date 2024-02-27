<script lang="ts">
	// Stores
	import { categories, mode, unAssigned } from '@stores/store';

	import Unassigned from './[...collectionName]/Unassigned.svelte';
	import Board from './Board.svelte';
	import { goto } from '$app/navigation';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getToastStore, getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
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
					// console.log('response:', r);
				}
			}
		};
		modalStore.trigger(d);
	}

	function handleAddCollectionClick() {
		console.log('handleAddCollectionClick:');
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
			icon: collection.icon,
			collections: collection
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
			icon: collection.icon,
			collections: collection
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
		console.log('handleSaveClick called');
		try {
			// console.log('availableCollection:', availableCollection);

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
				// Check the status of the response
				if (response.status === 304) {
					// If the status is 304, it means that the new content is the same as the existing content, and no save was done
					// console.log('Config file has not changed');

					// Trigger a toast indicating that the config file has not changed
					const t = {
						message: 'Config file has not changed',
						background: 'variant-variant-filled-tertiary',
						timeout: 3000,
						classes: 'border-1 !rounded-md'
					};
					toastStore.trigger(t);
				} else {
					// If the status is not 304, it means that the update was successful
					// console.log('Config file updated successfully');

					// Trigger a success toast
					const t = {
						message: 'Config file updated successfully',
						background: 'variant-filled-primary',
						timeout: 3000,
						classes: 'border-1 !rounded-md'
					};
					toastStore.trigger(t);
				}
			} else {
				console.error('Error updating config file');
				const errorDetails = await response.text();
				console.error('Server response:', errorDetails);

				// Trigger an error toast
				const t = {
					message: 'Error updating config file',
					background: 'variant-filled-error',
					timeout: 3000,
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
			}
		} catch (error) {
			console.error('Error updating config file:', error);

			// Trigger an error toast
			const t = {
				message: 'Error updating config file',
				background: 'variant-filled-error',
				timeout: 3000,
				classes: 'border-1 !rounded-md'
			};
			toastStore.trigger(t);
		}
	}

	console.log('mode', $mode);
</script>

<div class="mb-3 flex items-center justify-between">
	<PageTitle name={m.collection_pagetitle()} icon="" />

	<button type="button" on:click={handleSaveClick} class="variant-filled-tertiary btn gap-2 !text-white dark:variant-filled-primary">
		<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
		{m.collection_save()}
	</button>
</div>
<div class="wrapper">
	{#if !availableCollection}
		<p class="my-2 text-center">{m.collection_first()}</p>
	{:else}
		<p class="mb-4 text-center dark:text-primary-500">{m.collection_text_description()}</p>
		<!-- TODO: add sticky top sticky top-0 z-50 -->
		<div class="sticky top-0">
			<!-- Category/Collection buttons -->
			<div
				class=" mb-3 ml-1 flex flex-col justify-around gap-1 rounded-sm border border-surface-300 py-2 dark:border-surface-400 sm:flex-row lg:justify-center lg:gap-8"
			>
				<!-- add new Category-->
				<button on:click={modalAddCategory} type="button" class="variant-filled-tertiary btn-sm rounded-md">
					{m.collection_addcategory()}
				</button>

				<!-- add new Collection-->
				<button on:click={handleAddCollectionClick} type="button" class="variant-filled-success btn-sm rounded-md">
					{m.collection_addcollection()}
				</button>
			</div>

			<!-- TODO:calculate the width according to number of columns -->
			<!-- display unassigned collections -->

			<Unassigned items={UnassignedCollections} onDrop={handleUnassignedUpdated} />
		</div>

		<!-- display collections -->
		<Board columns={availableCollection} onFinalUpdate={handleBoardUpdated} />
	{/if}
</div>
