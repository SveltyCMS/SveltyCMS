<!-- 
@files src/routes/(app)/config/collection/ModalCategory.svelte
@component
**This component displays a modal for editing or creating a category**
-->
<script lang="ts">
	import type { CollectionData } from '@src/content/types';
	import { v4 as uuidv4 } from 'uuid';

	// Stores
	import { contentStructure } from '@src/stores/collectionStore.svelte';

	// Skeleton
	import { Modal } from '@skeletonlabs/skeleton-svelte'; // Import Modal component

	// Components
	import IconifyPicker from '@components/IconifyPicker.svelte';
	import ModalConfirm from '@components/ModalConfirm.svelte'; // Import confirmation modal

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Define form data shape
	interface FormData {
		newCategoryName: string;
		newCategoryIcon: string;
		id?: string; // Include ID for updates
	}

	// Props
	interface Props {
		open?: boolean; // Add open prop
		existingCategory?: Partial<CollectionData>; // Keep as Partial for flexibility on creation
		onSubmit: (data: FormData) => void; // Callback for submit/update
		onClose: () => void; // Callback for close
	}

	let { open = $bindable(), existingCategory = {}, onSubmit, onClose }: Props = $props();

	// State variables
	let formData = $state<FormData>({
		newCategoryName: existingCategory?.name ?? '',
		newCategoryIcon: existingCategory?.icon ?? '',
		id: existingCategory?.id
	});
	let isSubmitting = $state(false);
	let formError = $state<string | null>(null);
	let validationErrors = $state<Record<string, string>>({});
	let isConfirmDeleteOpen = $state(false); // State for delete confirmation modal

	// Sync local state when props change (modal opens for different category)
	$effect(() => {
		formData = {
			newCategoryName: existingCategory?.name ?? '',
			newCategoryIcon: existingCategory?.icon ?? '',
			id: existingCategory?.id
		};
		formError = null;
		validationErrors = {};
	});

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
			// Ensure ID is included for updates, generate if new
			const dataToSubmit = {
				...formData,
				id: formData.id ?? uuidv4()
			};
			onSubmit(dataToSubmit); // Call onSubmit prop
			// Parent handles closing
		} catch (error) {
			console.error('Error preparing submit data:', error);
			formError = error instanceof Error ? error.message : 'Error preparing submit data';
		} finally {
			isSubmitting = false;
		}
	}

	// Function to trigger delete confirmation
	function requestDeleteCategory(): void {
		// Check for subcategories before opening confirmation
		if (existingCategory?.subcategories && Object.keys(existingCategory.subcategories).length > 0) {
			formError = 'Cannot delete category with subcategories.';
			return;
		}
		isConfirmDeleteOpen = true; // Open the confirmation modal
	}

	// Actual deletion logic, called by ModalConfirm's onConfirm
	async function executeDelete(): Promise<void> {
		const categoryId = existingCategory?.id; // Get ID safely
		if (!categoryId) return; // Should have ID if deleting

		isSubmitting = true;
		formError = null;
		const originalCategoryState = { ...existingCategory }; // Store original state for potential revert

		try {
			// Update local store optimistically using filter for array
			contentStructure.update((currentStructure) => {
				return currentStructure.filter((category) => category._id !== categoryId);
			});

			// Persist to backend
			const response = await fetch('/api/save-categories', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				// Send the updated structure (without the deleted category)
				body: JSON.stringify(contentStructure.value)
			});

			if (!response.ok) {
				throw new Error('Failed to save category changes');
			}
			onClose(); // Close the main modal after successful deletion
		} catch (error) {
			console.error('Error deleting category:', error);
			formError = error instanceof Error ? error.message : 'Failed to delete category';

			// Revert store changes on error by pushing the original category back into the array
			contentStructure.update((cats) => {
				// Ensure the object being pushed conforms to ContentStructureNode
				// This might need adjustment if CollectionData != ContentStructureNode
				const categoryToRevert = originalCategoryState as any; // Use 'as any' for now
				// Avoid duplicates if revert is called multiple times
				if (!cats.some((cat) => cat._id === categoryId)) {
					return [...cats, categoryToRevert];
				}
				return cats;
			});
		} finally {
			isSubmitting = false;
		}
	}
</script>

<!-- Main Modal -->
<Modal
	{open}
	onOpenChange={(e) => {
		if (!e.open) {
			onClose(); // Call onClose if closed externally
		}
	}}
	contentBase="card bg-surface-100-900 p-4 md:p-6 space-y-4 shadow-xl max-w-screen-sm rounded-lg"
	backdropClasses="backdrop-blur-sm"
>
	{#snippet content()}
		<header class="border-surface-300-700 flex items-center justify-between border-b pb-4">
			<h2 class="h2">{existingCategory?.id ? 'Edit Category' : 'Create New Category'}</h2>
			<button type="button" class="btn-icon btn-icon-sm preset-soft hover:preset-ghost" aria-label="Close modal" onclick={onClose}>
				<iconify-icon icon="mdi:close" width="20"></iconify-icon>
			</button>
		</header>

		<article class="text-center">Enter the details for the category.</article>

		{#if formError}
			<div class="preset-soft-error rounded-sm p-2 text-center" role="alert">
				{formError}
			</div>
		{/if}

		<form class="space-y-4" onsubmit={onFormSubmit}>
			<label class="label">
				<span>{m.modalcategory_categoryname()} <span class="text-error-500">*</span></span>
				<input
					id="category_name"
					class="input {validationErrors.name ? 'input-error' : ''}"
					type="text"
					bind:value={formData.newCategoryName}
					placeholder={m.modalcategory_placeholder()}
					aria-invalid={!!validationErrors.name}
					aria-describedby={validationErrors.name ? 'name-error' : undefined}
					disabled={isSubmitting}
					required
				/>
				{#if validationErrors.name}
					<span id="name-error" class="text-error-500 text-sm">{validationErrors.name}</span>
				{/if}
			</label>

			<label class="label">
				<span>{m.modalcategory_icon()} <span class="text-error-500">*</span></span>
				<IconifyPicker bind:iconselected={formData.newCategoryIcon} searchQuery={formData.newCategoryIcon} />
				{#if validationErrors.icon}
					<span id="icon-error" class="text-error-500 text-sm">{validationErrors.icon}</span>
				{/if}
			</label>

			<!-- Footer within the form for submit -->
			<footer class="flex {existingCategory?.id ? 'justify-between' : 'justify-end'} pt-4">
				{#if existingCategory?.id}
					<button type="button" onclick={requestDeleteCategory} class="btn preset-filled-error" aria-label="Delete category" disabled={isSubmitting}>
						<iconify-icon icon="icomoon-free:bin" width="20" class="mr-1"></iconify-icon>
						<span class="hidden md:inline">{m.button_delete()}</span>
					</button>
				{/if}

				<div class="flex gap-3">
					<button type="button" onclick={onClose} class="btn preset-soft" aria-label={m.button_cancel()} disabled={isSubmitting}>
						{m.button_cancel()}
					</button>
					<button type="submit" class="btn preset-filled-primary" aria-label={m.button_save()} disabled={isSubmitting}>
						{#if isSubmitting}
							<iconify-icon icon="eos-icons:loading" class="mr-1 animate-spin" width="20"></iconify-icon>
						{/if}
						{m.button_save()}
					</button>
				</div>
			</footer>
		</form>
	{/snippet}
</Modal>

<!-- Nested Confirmation Modal -->
<ModalConfirm
	bind:open={isConfirmDeleteOpen}
	title="Confirm Deletion"
	body={`Are you sure you wish to delete the category "${formData.newCategoryName}"? This cannot be undone.`}
	buttonTextConfirm="Delete Category"
	onConfirm={executeDelete}
	onClose={() => (isConfirmDeleteOpen = false)}
></ModalConfirm>
