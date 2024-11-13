<!-- 
@files src/routes/(app)/config/collection/ModalCategory.svelte
@description This component displays a modal for editing a category.
-->
<script lang="ts">
	import type { CategoryData } from '@src/collections/types';
	import { createRandomID } from '@utils/utils';

	// Stores
	import { categories } from '@root/src/stores/collectionStore.svelte';
	import { getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';

	// Components
	import IconifyPicker from '@components/IconifyPicker.svelte';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface Props {
		parent: {
			onClose: () => void;
			regionFooter?: string;
			buttonPositive?: string;
		};
		existingCategory?: Partial<CategoryData>;
	}

	interface FormData {
		newCategoryName: string;
		newCategoryIcon: string;
		id?: string;
	}

	let { parent, existingCategory = { name: '', icon: '' } }: Props = $props();

	const modalStore = getModalStore();

	// State variables
	let formData = $state<FormData>({
		newCategoryName: existingCategory.name ?? '',
		newCategoryIcon: existingCategory.icon ?? ''
	});
	let isSubmitting = $state(false);
	let formError = $state<string | null>(null);
	let validationErrors = $state<Record<string, string>>({});

	// Form validation
	function validateForm(): boolean {
		const errors: Record<string, string> = {};

		if (!formData.newCategoryName.trim()) {
			errors.name = 'Category name is required';
		} else if (formData.newCategoryName.length < 2) {
			errors.name = 'Category name must be at least 2 characters';
		}

		if (!formData.newCategoryIcon.trim()) {
			errors.icon = 'Icon is required';
		}

		validationErrors = errors;
		return Object.keys(errors).length === 0;
	}

	// Submit handler
	async function onFormSubmit(event: Event): Promise<void> {
		event.preventDefault();
		if (!validateForm()) return;

		isSubmitting = true;
		formError = null;

		try {
			if ($modalStore[0]?.response) {
				if (!existingCategory.id) {
					// Generate new ID for new categories
					const newId = await createRandomID();
					$modalStore[0].response({ ...formData, id: newId });
				} else {
					$modalStore[0].response(formData);
				}
			}
			modalStore.close();
		} catch (error) {
			console.error('Error submitting form:', error);
			formError = error instanceof Error ? error.message : 'Error submitting form';
		} finally {
			isSubmitting = false;
		}
	}

	// Delete handler
	async function deleteCategory(): Promise<void> {
		if (!existingCategory.subcategories || Object.keys(existingCategory.subcategories).length === 0) {
			const confirmModal: ModalSettings = {
				type: 'confirm',
				title: 'Please Confirm',
				body: 'Are you sure you wish to delete this category?',
				response: async (confirmed: boolean) => {
					if (!confirmed) return;

					isSubmitting = true;
					formError = null;

					try {
						// Update local store
						categories.update((existingCategories) => {
							const newCategories = { ...existingCategories };
							if (existingCategory.name) {
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
						formError = error instanceof Error ? error.message : 'Failed to delete category';

						// Revert store changes on error
						if (existingCategory.id) {
							categories.update((cats) => ({
								...cats,
								[existingCategory.id as string]: existingCategory as CategoryData
							}));
						}
					} finally {
						isSubmitting = false;
					}
				}
			};

			modalStore.trigger(confirmModal);
			modalStore.close();
		} else {
			formError = 'Cannot delete category with subcategories.';
		}
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4';
	const cHeader = 'text-2xl font-bold text-center text-tertiary-500 dark:text-primary-500';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

{#if $modalStore[0]}
	<div class={cBase} role="dialog" aria-labelledby="modal-title" aria-describedby="modal-description">
		<header class={cHeader}>
			<h2 id="modal-title">{$modalStore[0]?.title ?? '(title missing)'}</h2>
		</header>

		<article id="modal-description" class="hidden text-center sm:block">
			{$modalStore[0].body ?? '(body missing)'}
		</article>

		{#if formError}
			<div class="rounded bg-error-500/10 p-2 text-error-500" role="alert">
				{formError}
			</div>
		{/if}

		<form class="modal-form {cForm}" onsubmit={onFormSubmit}>
			<label class="label" for="category_name">
				<span>{m.modalcategory_categoryname()}</span>
				<input
					class="input"
					type="text"
					id="category_name"
					bind:value={formData.newCategoryName}
					placeholder={m.modalcategory_placeholder()}
					aria-invalid={!!validationErrors.name}
					aria-describedby={validationErrors.name ? 'name-error' : undefined}
					disabled={isSubmitting}
				/>
				{#if validationErrors.name}
					<span id="name-error" class="text-sm text-error-500">{validationErrors.name}</span>
				{/if}
			</label>

			<label class="label" for="icon-picker">
				{m.modalcategory_icon()}
				<IconifyPicker bind:iconselected={formData.newCategoryIcon} searchQuery={formData.newCategoryIcon} />
				{#if validationErrors.icon}
					<span id="icon-error" class="text-sm text-error-500">{validationErrors.icon}</span>
				{/if}
			</label>
		</form>

		<footer class="modal-footer flex {existingCategory.name ? 'justify-between' : 'justify-end'} {parent.regionFooter}">
			{#if existingCategory.name}
				<button type="button" onclick={deleteCategory} class="variant-filled-error btn" aria-label="Delete category" disabled={isSubmitting}>
					<iconify-icon icon="icomoon-free:bin" width="24"></iconify-icon>
					<span class="hidden md:inline">{m.button_delete()}</span>
				</button>
			{/if}

			<div class="flex gap-2">
				<button type="button" onclick={parent.onClose} class="variant-outline-secondary btn" aria-label={m.button_cancel()} disabled={isSubmitting}>
					{m.button_cancel()}
				</button>
				<button
					type="submit"
					class="variant-filled-tertiary btn dark:variant-filled-primary {parent.buttonPositive}"
					aria-label={m.button_save()}
					disabled={isSubmitting}
				>
					{#if isSubmitting}
						<iconify-icon icon="eos-icons:loading" class="animate-spin" width="24"></iconify-icon>
					{/if}
					{m.button_save()}
				</button>
			</div>
		</footer>
	</div>
{/if}
