<!-- 
 @file src/routes/(app)/config/collection/+page.svelte
 @description This component sets up and displays the collection page with nested category support.
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { categoryConfig } from '@src/collections/categories';
	import { createRandomID } from '@utils/utils';
	import type { CategoryData } from '@src/collections/types';

	// Stores
	import { collectionValue, mode, categories } from '@stores/collectionStore';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import Board from './Board.svelte';
	import ModalCategory from './ModalCategory.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getToastStore, getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	let currentConfig = categoryConfig;

	// Initialize the categories store with the current config
	$: {
		categories.set(currentConfig);
	}

	// Modal Trigger - New Category
	function modalAddCategory(existingCategory?: { name: string; icon: string }): void {
		const modalComponent: ModalComponent = {
			ref: ModalCategory,
			props: {
				existingCategory
			}
		};
		const d: ModalSettings = {
			type: 'component',
			title: existingCategory ? 'Edit Category' : 'Add New Category',
			body: existingCategory ? 'Modify Category Details' : 'Enter Unique Name and an Icon for your new category column',
			component: modalComponent,
			response: async (r: any) => {
				if (r) {
					if (existingCategory) {
						// Update existing category
						const newConfig = { ...currentConfig };
						Object.entries(newConfig).forEach(([key, category]) => {
							if (category.name === existingCategory.name) {
								category.name = r.newCategoryName;
								category.icon = r.newCategoryIcon;
							}
							// Also check subcategories
							if (category.subcategories) {
								Object.entries(category.subcategories).forEach(([subKey, subCategory]) => {
									if (subCategory.name === existingCategory.name) {
										subCategory.name = r.newCategoryName;
										subCategory.icon = r.newCategoryIcon;
									}
								});
							}
						});
						currentConfig = newConfig;
						categories.set(newConfig);
					} else {
						// Add new category at the end of the list
						const newConfig = { ...currentConfig };
						const categoryKey = r.newCategoryName.toLowerCase().replace(/\s+/g, '-');
						const newCategoryId = await createRandomID();

						// Add the new category as a top-level category
						newConfig[categoryKey] = {
							id: newCategoryId,
							name: r.newCategoryName,
							icon: r.newCategoryIcon,
							subcategories: {}
						};

						currentConfig = newConfig;
						categories.set(newConfig);
					}
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
		goto('/config/collectionbuilder/new');
	}

	// Saving changes to the config.ts
	async function updateConfig(newConfig: Record<string, CategoryData>) {
		try {
			const response = await fetch('/api/categories', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					categories: newConfig,
					save: true
				})
			});

			const result = await response.json();

			if (response.ok) {
				showToast('Categories updated successfully', 'success');
				currentConfig = newConfig;
				categories.set(newConfig);
			} else {
				const errorMessage = result.error || 'Error updating categories';
				console.error('Update categories error:', result);
				showToast(errorMessage, 'error');
			}
		} catch (error) {
			console.error('Network error:', error);
			showToast('Network error occurred while updating categories', 'error');
		}
	}

	// Show corresponding Toast messages
	function showToast(message: string, type: 'success' | 'info' | 'error') {
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
	<button
		on:click={() => modalAddCategory()}
		type="button"
		class="variant-filled-tertiary btn flex items-center justify-between gap-1 rounded font-bold dark:variant-filled-primary"
	>
		<iconify-icon icon="bi:collection" width="18" class="text-white" />
		{m.collection_addcategory()}
	</button>

	<!-- add new Collection-->
	<button
		on:click={handleAddCollectionClick}
		type="button"
		class="variant-filled-surface btn flex items-center justify-between gap-1 rounded font-bold"
	>
		<iconify-icon icon="material-symbols:category" width="18" />
		{m.collection_addcollection()}
	</button>

	<button type="button" on:click={() => updateConfig(currentConfig)} class="variant-filled-primary btn gap-2 lg:ml-4">
		<iconify-icon icon="material-symbols:save" width="24" class="text-white" />
		{m.button_save()}
	</button>
</div>

<div class="max-h-[calc(100vh-65px)] overflow-auto">
	<div class="wrapper mb-2">
		<p class="mb-4 text-center dark:text-primary-500">{m.collection_text_description()}</p>

		<!-- display collections -->
		<Board categoryConfig={currentConfig} onEditCategory={modalAddCategory} />
	</div>
</div>
