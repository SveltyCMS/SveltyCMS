<!--
@file src/routes/(app)/config/collectionbuilder/NestedContent/ModalCategory.svelte
@component
**This component displays a modal for editing a category**
-->
<script lang="ts">
	import IconifyIconsPicker from '@src/components/iconify-icons-picker.svelte';
	import { button_cancel, button_delete, button_save, modalcategory_categoryname, modalcategory_placeholder } from '@src/paraglide/messages';

	// Stores
	import { contentStructure } from '@src/stores/collection-store.svelte';
	import { logger } from '@utils/logger';

	// Lucide Icons

	import type { ContentNode } from '@root/src/databases/db-interface';

	interface Props {
		body?: string;
		close?: (result?: any) => void;
		existingCategory?: Partial<ContentNode>;
		parent?: {
			onClose?: () => void;
			regionFooter?: string;
			buttonPositive?: string;
		};
		title?: string;
	}

	interface FormData {
		id?: string;
		newCategoryIcon: string;
		newCategoryName: string;
	}

	const { existingCategory = { name: '', icon: '' }, close }: Props = $props();

	// State variables for form and UI
	const formData = $state<FormData>({
		newCategoryName: '',
		newCategoryIcon: ''
	});
	let isSubmitting = $state(false);
	let formError = $state<string | null>(null);
	let validationErrors = $state<Record<string, string>>({});

	$effect(() => {
		formData.newCategoryName = existingCategory.name ?? '';
		formData.newCategoryIcon = existingCategory.icon ?? '';
	});

	/**
	 * Validates the form input fields.
	 * @returns True if the form is valid, false otherwise.
	 */
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

	/**
	 * Handles form submission. Validates, then sends data back via the modal's response callback.
	 * @param event The form submission event.
	 */
	async function onFormSubmit(event: Event): Promise<void> {
		event.preventDefault(); // Prevent default form submission
		if (!validateForm()) {
			logger.error('Form validation failed.');
			return;
		}

		isSubmitting = true;
		formError = null;

		try {
			if (close) {
				// If adding a new category, generate a UUID
				if (existingCategory._id) {
					close(formData); // For editing, pass existing ID implied
				} else {
					close(formData); // `+page.svelte` will assign ID
				}
			}
		} catch (error) {
			logger.error('Error submitting category form:', error);
			formError = error instanceof Error ? error.message : 'Error submitting form';
		} finally {
			isSubmitting = false;
		}
	}

	/**
	 * Handles deletion of an existing category.
	 * Requires confirmation and checks for child categories.
	 */
	async function deleteCategory(): Promise<void> {
		// Prevent deletion if category has children (collections or subcategories)
		// This check is a simplification; a more robust solution would determine if `existingCategory.children`
		// holds any values based on your `ContentNode` definition or fetch it live.
		// For now, assuming `existingCategory.children` refers to a property that exists if children are present.
		if (existingCategory.nodeType === 'category' && contentStructure.value.some((node) => node.parentId === existingCategory._id)) {
			formError = 'Cannot delete category with nested items (collections or subcategories). Please move or delete them first.';
			return;
		}

		// Using a simple confirm dialog for now, as the modalStore is being removed.
		// In a real application, you'd likely replace this with a custom confirmation modal component.
		const confirmed = confirm(`Are you sure you wish to delete the category "${existingCategory.name}"? This action cannot be undone.`);

		if (!confirmed) {
			return; // User cancelled confirmation
		}

		isSubmitting = true;
		formError = null;

		try {
			// Persist to backend
			const response = await fetch('/api/content-structure', {
				method: 'POST', // Use POST for actions that modify data
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'updateContentStructure', // Re-use updateContentStructure for deletion
					items: [
						{
							type: 'delete', // Define a 'delete' operation type
							node: existingCategory // Pass the node to be deleted
						}
					]
				})
			});

			if (!response.ok) {
				const errorResult = await response.json();
				throw new Error(errorResult.error || 'Failed to delete category');
			}
			const {
				success,
				contentStructure: newStructure // API should return updated full structure
			}: {
				success: boolean;
				contentStructure: ContentNode[];
			} = await response.json();
			if (!success) {
				throw new Error('API reported failure to delete category.');
			}

			contentStructure.value = newStructure;
			close?.(null); // Close modal after successful deletion, passing null as no data is returned
		} catch (error) {
			logger.error('Error deleting category:', error);
			formError = error instanceof Error ? error.message : 'Failed to delete category';
		} finally {
			isSubmitting = false;
		}
	}

	// Base Classes for Skeleton modal
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-xl';
</script>

<div class="modal-example-form space-y-4">
	{#if formError}
		<div class="rounded bg-error-500/10 p-2 text-error-500" role="alert">{formError}</div>
	{/if}

	<form class="modal-form {cForm}" onsubmit={onFormSubmit}>
		<label class="label" for="category_name">
			<span>{modalcategory_categoryname()}</span>
			<input
				class="input"
				type="text"
				id="category_name"
				bind:value={formData.newCategoryName}
				placeholder={modalcategory_placeholder()}
				aria-invalid={!!validationErrors.name}
				aria-describedby={validationErrors.name ? 'name-error' : undefined}
				disabled={isSubmitting}
			/>
			{#if validationErrors.name}
				<span id="name-error" class="text-sm text-error-500">{validationErrors.name}</span>
			{/if}
		</label>

		<label class="label" for="icon-picker">
			<span>Icon</span>
			<IconifyIconsPicker bind:iconselected={formData.newCategoryIcon} searchQuery={formData.newCategoryIcon} />
			{#if validationErrors.icon}
				<span id="icon-error" class="text-sm text-error-500">{validationErrors.icon}</span>
			{/if}
		</label>
		<footer class="modal-footer flex {existingCategory.name ? 'justify-between' : 'justify-end'} pt-4 border-t border-surface-500/20">
			{#if existingCategory.name}
				<button type="button" onclick={deleteCategory} class="preset-filled-error-500 btn" aria-label="Delete category" disabled={isSubmitting}>
					<iconify-icon icon="icomoon-free:bin" width={24}></iconify-icon>
					<span class="hidden md:inline">{button_delete()}</span>
				</button>
			{/if}

			<div class="flex gap-2">
				<button type="button" class="preset-outlined-secondary-500 btn" onclick={() => close?.(null)} disabled={isSubmitting}>
					{button_cancel()}
				</button>
				<button
					type="submit"
					class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500"
					aria-label={button_save()}
					disabled={isSubmitting}
				>
					{#if isSubmitting}
						<iconify-icon icon="eos-icons:loading" width={24} class="animate-spin"></iconify-icon>
					{/if}
					{button_save()}
				</button>
			</div>
		</footer>
	</form>
</div>
