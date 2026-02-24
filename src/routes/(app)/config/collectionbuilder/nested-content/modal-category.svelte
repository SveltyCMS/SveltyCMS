<!--
@file src/routes/(app)/config/collectionbuilder/NestedContent/ModalCategory.svelte
@component
**This component displays a modal for editing a category**
-->
<script lang="ts">
	import { modalcategory_placeholder, button_delete, button_cancel, button_save, modalcategory_categoryname } from '@src/paraglide/messages';
	import IconifyIconsPicker from '@src/components/iconify-icons-picker.svelte';

	// Stores
	import { contentStructure, setContentStructure } from '@src/stores/collection-store.svelte';
	import { logger } from '@utils/logger';
	import { deserialize } from '$app/forms';
	import { invalidate } from '$app/navigation';

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
	// Separate search query for icon picker (Iconify API expects search terms, not full icon ids like "ic:baseline-add-card")
	let categoryIconSearch = $state('');
	let isSubmitting = $state(false);
	let formError = $state<string | null>(null);
	let validationErrors = $state<Record<string, string>>({});

	$effect(() => {
		formData.newCategoryName = existingCategory.name ?? '';
		formData.newCategoryIcon = existingCategory.icon ?? '';
	});

	/** Collect category id and all descendant node ids (for cascade delete; server deletes attached collections and their .ts files). */
	function getDescendantIds(categoryId: string, flat: ContentNode[]): string[] {
		const idSet = new Set<string>();
		const add = (id: string) => {
			if (idSet.has(id)) return;
			idSet.add(id);
			flat.filter((n) => n.parentId?.toString() === id).forEach((n) => add(n._id?.toString() ?? ''));
		};
		add(categoryId);
		return Array.from(idSet);
	}

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
	 * Cascades to all attached collections and subcategories; server also deletes collection .ts files.
	 */
	async function deleteCategory(): Promise<void> {
		const categoryId = existingCategory._id?.toString();
		if (!categoryId) {
			formError = 'Category has no ID';
			return;
		}

		const flat = contentStructure.value ?? [];
		const idsToDelete = getDescendantIds(categoryId, flat);
		const attachedCount = idsToDelete.length - 1;

		const body =
			attachedCount > 0
				? `Delete category "${existingCategory.name}" and all ${attachedCount} attached collection(s) and sub-categories? Their config files will be removed. This action cannot be undone.`
				: `Are you sure you wish to delete the category "${existingCategory.name}"? This action cannot be undone.`;

		const confirmed = confirm(body);
		if (!confirmed) return;

		isSubmitting = true;
		formError = null;

		try {
			const formDataDelete = new FormData();
			formDataDelete.append('ids', JSON.stringify(idsToDelete));
			const response = await fetch('?/deleteCollections', {
				method: 'POST',
				body: formDataDelete
			});

			const text = await response.text();
			const result = text
				? (deserialize(text) as {
						type?: string;
						data?: { success?: boolean; message?: string; contentStructure?: ContentNode[] };
						error?: { message?: string };
					})
				: {};
			const payload = (result.type === 'success' || result.type === 'failure' ? result.data : result) as
				| { success?: boolean; message?: string; contentStructure?: ContentNode[] }
				| undefined;
			const message = result.type === 'error' ? (result.error?.message ?? 'Server error') : (payload?.message ?? 'Deletion failed');

			if (!response.ok) {
				logger.error('Delete category failed', message);
				formError = message;
				return;
			}

			if ((result.type === 'success' && payload?.success) || payload?.success === true) {
				const newStructure =
					payload?.contentStructure && Array.isArray(payload.contentStructure)
						? payload.contentStructure
						: flat.filter((n) => !new Set(idsToDelete).has(n._id?.toString() ?? ''));
				setContentStructure(newStructure);
				await invalidate('app:content');
				close?.({ __categoryDeleted: true, contentStructure: newStructure });
			} else {
				formError = message;
			}
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
			<IconifyIconsPicker bind:iconselected={formData.newCategoryIcon} icon={formData.newCategoryIcon} bind:searchQuery={categoryIconSearch} />
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
