<!-- 
@files src/routes/(app)/config/collection/ModalCategory.svelte
@description This component displays a modal for editing a category.
-->
<script lang="ts">
	import type { CategoryData } from '@src/collections/types';
	import { createRandomID } from '@utils/utils';

	// Props
	/** Exposes parent props to this component. */
	export let parent: any;
	export let existingCategory: Partial<CategoryData> = { name: '', icon: '' };

	// Stores
	import { categories } from '@stores/collectionStore';
	import { getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();

	// Components
	import IconifyPicker from '@components/IconifyPicker.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Form Data
	const formData = {
		newCategoryName: existingCategory.name ?? '',
		newCategoryIcon: existingCategory.icon ?? ''
	};

	// We've created a custom submit function to pass the response and close the modal.
	async function onFormSubmit(): Promise<void> {
		if ($modalStore[0].response) {
			if (!existingCategory.id) {
				// Generate new ID for new categories
				const newId = await createRandomID();
				$modalStore[0].response({ ...formData, id: newId });
			} else {
				$modalStore[0].response(formData);
			}
		}
		modalStore.close();
	}

	async function deleteCategory(): Promise<void> {
		if (!existingCategory.subcategories || Object.keys(existingCategory.subcategories).length === 0) {
			// Define the confirmation modal
			const confirmModal: ModalSettings = {
				type: 'confirm',
				title: 'Please Confirm',
				body: 'Are you sure you wish to delete this category?',
				response: async (r: boolean) => {
					if (r) {
						try {
							// Update local store
							categories.update((existingCategories) => {
								const newCategories = { ...existingCategories };
								if (existingCategory.name) {
									// Find and delete the category
									Object.keys(newCategories).forEach((key) => {
										if (newCategories[key].name === existingCategory.name) {
											delete newCategories[key];
										}
									});
								}
								return newCategories;
							});

							// Persist to backend
							const response = await fetch('/api/save-categories', {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json'
								},
								body: JSON.stringify($categories)
							});

							if (!response.ok) {
								throw new Error('Failed to save category changes');
							}
						} catch (error) {
							console.error('Error deleting category:', error);
							alert('Failed to delete category. Please try again.');

							// Revert store changes on error
							if (existingCategory.id) {
								categories.update((cats) => ({
									...cats,
									[existingCategory.id as string]: existingCategory as CategoryData
								}));
							}
						}
					}
				}
			};

			modalStore.trigger(confirmModal);
			modalStore.close(); // Close the modal
		} else {
			alert('Cannot delete category with subcategories.');
		}
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 ';
	const cHeader = 'text-2xl font-bold text-center text-tertiary-500 dark:text-primary-500 ';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

{#if $modalStore[0]}
	<div class=" {cBase}">
		<header class={`${cHeader}`}>
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article class="hidden text-center sm:block">{$modalStore[0].body ?? '(body missing)'}</article>
		<!-- Enable for debugging: -->
		<form class="modal-form {cForm}">
			<label class="label" for="category_name">
				<span>{m.modalcategory_categoryname()}</span>
				<input class="input" type="text" bind:value={formData.newCategoryName} placeholder={m.modalcategory_placeholder()} />
			</label>

			<label class="label" for="icon-picker">
				{m.modalcategory_icon()}
				<IconifyPicker bind:iconselected={formData.newCategoryIcon} searchQuery={formData.newCategoryIcon} />
			</label>
		</form>

		<footer class="modal-footer flex {existingCategory.name ? 'justify-between' : 'justify-end'} {parent.regionFooter}">
			{#if existingCategory.name}
				<button type="button" on:click={deleteCategory} class="variant-filled-error btn">
					<iconify-icon icon="icomoon-free:bin" width="24" /><span class="hidden md:inline">{m.button_delete()}</span>
				</button>
			{/if}

			<div class="flex gap-2">
				<button class="variant-outline-secondary btn" on:click={parent.onClose}>{m.button_cancel()}</button>
				<button class="variant-filled-tertiary btn dark:variant-filled-primary {parent.buttonPositive}" on:click={onFormSubmit}
					>{m.button_save()}
				</button>
			</div>
		</footer>
	</div>
{/if}
