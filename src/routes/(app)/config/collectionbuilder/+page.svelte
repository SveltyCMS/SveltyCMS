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

	interface CategoryModalResponse {
		newCategoryName: string;
		newCategoryIcon: string;
	}

	interface ApiResponse {
		error?: string;
		[key: string]: any;
	}

	// State variables
	let currentConfig = $state<Record<string, CategoryData>>(categoryConfig);
	let isLoading = $state(false);
	let apiError = $state<string | null>(null);

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Initialize the categories store with the current config
	$effect(() => {
		categories.set(currentConfig);
	});

	// Modal Trigger - New Category
	function modalAddCategory(existingCategory?: { name: string; icon: string }): void {
		const modalComponent: ModalComponent = {
			ref: ModalCategory,
			props: {
				existingCategory
			}
		};

		const modalSettings: ModalSettings = {
			type: 'component',
			title: existingCategory ? 'Edit Category' : 'Add New Category',
			body: existingCategory ? 'Modify Category Details' : 'Enter Unique Name and an Icon for your new category column',
			component: modalComponent,
			response: async (response: CategoryModalResponse | boolean) => {
				if (!response || typeof response === 'boolean') return;

				try {
					if (existingCategory) {
						await updateExistingCategory(existingCategory, response);
					} else {
						await addNewCategory(response);
					}
				} catch (error) {
					console.error('Error handling modal response:', error);
					showToast('Error updating categories', 'error');
				}
			}
		};

		modalStore.trigger(modalSettings);
	}

	async function updateExistingCategory(existingCategory: { name: string; icon: string }, response: CategoryModalResponse) {
		const newConfig = { ...currentConfig };
		Object.entries(newConfig).forEach(([key, category]) => {
			if (category.name === existingCategory.name) {
				category.name = response.newCategoryName;
				category.icon = response.newCategoryIcon;
			}
			// Also check subcategories
			if (category.subcategories) {
				Object.entries(category.subcategories).forEach(([subKey, subCategory]) => {
					if (subCategory.name === existingCategory.name) {
						subCategory.name = response.newCategoryName;
						subCategory.icon = response.newCategoryIcon;
					}
				});
			}
		});
		currentConfig = newConfig;
		categories.set(newConfig);
	}

	async function addNewCategory(response: CategoryModalResponse) {
		const newConfig = { ...currentConfig };
		const categoryKey = response.newCategoryName.toLowerCase().replace(/\s+/g, '-');
		const newCategoryId = await createRandomID();

		newConfig[categoryKey] = {
			id: newCategoryId,
			name: response.newCategoryName,
			icon: response.newCategoryIcon,
			subcategories: {}
		};

		currentConfig = newConfig;
		categories.set(newConfig);
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
		isLoading = true;
		apiError = null;

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

			const result: ApiResponse = await response.json();

			if (response.ok) {
				showToast('Categories updated successfully', 'success');
				currentConfig = newConfig;
				categories.set(newConfig);
			} else {
				const errorMessage = result.error || 'Error updating categories';
				console.error('Update categories error:', result);
				apiError = errorMessage;
				showToast(errorMessage, 'error');
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Network error occurred';
			console.error('Network error:', error);
			apiError = errorMessage;
			showToast(`Network error: ${errorMessage}`, 'error');
		} finally {
			isLoading = false;
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
		onclick={() => modalAddCategory()}
		type="button"
		aria-label="Add New Category"
		class="variant-filled-tertiary btn flex items-center justify-between gap-1 rounded font-bold dark:variant-filled-primary"
		disabled={isLoading}
	>
		<iconify-icon icon="bi:collection" width="18" class="text-white"></iconify-icon>
		{m.collection_addcategory()}
	</button>

	<!-- add new Collection-->
	<button
		onclick={handleAddCollectionClick}
		type="button"
		aria-label="Add New Collection"
		class="variant-filled-surface btn flex items-center justify-between gap-1 rounded font-bold"
		disabled={isLoading}
	>
		<iconify-icon icon="material-symbols:category" width="18"></iconify-icon>
		{m.collection_addcollection()}
	</button>

	<button
		type="button"
		onclick={() => updateConfig(currentConfig)}
		aria-label="Save"
		class="variant-filled-primary btn gap-2 lg:ml-4"
		disabled={isLoading}
	>
		{#if isLoading}
			<iconify-icon icon="eos-icons:loading" width="24" class="animate-spin text-white"></iconify-icon>
		{:else}
			<iconify-icon icon="material-symbols:save" width="24" class="text-white"></iconify-icon>
		{/if}
		{m.button_save()}
	</button>
</div>

{#if apiError}
	<div class="mb-4 rounded bg-error-500/10 p-4 text-error-500" role="alert">
		{apiError}
	</div>
{/if}

<div class="max-h-[calc(100vh-65px)] overflow-auto">
	<div class="wrapper mb-2">
		<p class="mb-4 text-center dark:text-primary-500">{m.collection_text_description()}</p>

		<!-- display collections -->
		<Board {categoryConfig} onEditCategory={modalAddCategory} />
	</div>
</div>
