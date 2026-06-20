<!--
@file src/routes/(app)/config/collectionbuilder/NestedContent/ModalCategory.svelte
@component
**This component displays a modal for editing a category**
-->
<script lang="ts">
import { SvelteSet } from "svelte/reactivity";
import IconifyIconsPicker from "@src/components/iconify-icons-picker.svelte";
import {
	button_cancel,
	button_delete,
	button_save,
	modalcategory_categoryname,
	modalcategory_placeholder,
} from "@src/paraglide/messages";

// Stores
import {
	contentStructure,
	setContentStructure,
} from "@src/stores/collection-store.svelte";
import { logger } from "@utils/logger";
import { invalidate } from "$app/navigation";

// Lucide Icons

import type { ContentNode } from "@root/src/databases/db-interface";
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';

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

const { existingCategory = { name: "", icon: "" }, close }: Props = $props();

// State variables for form and UI
const formData = $state<FormData>({
	newCategoryName: "",
	newCategoryIcon: "",
});
// Separate search query for icon picker (Iconify API expects search terms, not full icon ids like "ic:baseline-add-card")
let categoryIconSearch = $state("");
let isSubmitting = $state(false);
let formError = $state<string | null>(null);
let validationErrors = $state<Record<string, string>>({});

$effect(() => {
	formData.newCategoryName = existingCategory.name ?? "";
	formData.newCategoryIcon = existingCategory.icon ?? "";
});

/** Collect category id and all descendant node ids (for cascade delete; server deletes attached collections and their .ts files). */
function getDescendantIds(categoryId: string, flat: ContentNode[]): string[] {
	const idSet = new SvelteSet<string>();
	const add = (id: string) => {
		if (idSet.has(id)) return;
		idSet.add(id);
		flat
			.filter((n) => n.parentId?.toString() === id)
			.forEach((n) => add(n._id?.toString() ?? ""));
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
		errors.name = "Category name is required";
	} else if (formData.newCategoryName.length < 2) {
		errors.name = "Category name must be at least 2 characters";
	}

	if (!formData.newCategoryIcon.trim()) {
		errors.icon = "Icon is required";
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
		logger.error("Form validation failed.");
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
		logger.error("Error submitting category form:", error);
		formError =
			error instanceof Error ? error.message : "Error submitting form";
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
		formError = "Category has no ID";
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
		const { deleteContentNodes } = await import("../collectionbuilder.remote");
		const result = await deleteContentNodes([categoryId]);

		if ("success" in result && result.success) {
			const newStructure = flat.filter(
				(n) => !new SvelteSet(idsToDelete).has(n._id?.toString() ?? ""),
			);
			setContentStructure(newStructure);
			await invalidate("app:content");
			close?.({ __categoryDeleted: true, contentStructure: newStructure });
		} else {
			const message = (result as any).message ?? "Deletion failed";
			formError = message;
		}
	} catch (error) {
		logger.error("Error deleting category:", error);
		formError =
			error instanceof Error ? error.message : "Failed to delete category";
	} finally {
		isSubmitting = false;
	}
}

// Base Classes for native modal
const cForm = "border border-surface-500 p-4 space-y-4 rounded";
</script>

<div class="modal-example-form space-y-4">
	{#if formError}
		<div class="rounded bg-error-500/10 p-2 text-error-500" role="alert">{formError}</div>
	{/if}

	<form class="modal-form {cForm}" onsubmit={onFormSubmit}>
		<Input
			type="text"
			id="category_name"
			bind:value={formData.newCategoryName}
			label={modalcategory_categoryname()}
			placeholder={modalcategory_placeholder()}
			error={validationErrors.name}
			disabled={isSubmitting}
		/>

		<label class="label" for="icon-picker">
			<span>Icon</span>
			<IconifyIconsPicker bind:iconselected={formData.newCategoryIcon} icon={formData.newCategoryIcon} bind:searchQuery={categoryIconSearch} />
			{#if validationErrors.icon}
				<span id="icon-error" class="text-sm text-error-500">{validationErrors.icon}</span>
			{/if}
		</label>
		<footer class="modal-footer flex {existingCategory.name ? 'justify-between' : 'justify-end'} pt-4 border-t border-surface-500/20">
			{#if existingCategory.name}
				<Button variant="error" type="button" onclick={deleteCategory} aria-label="Delete category" disabled={isSubmitting}>
					<iconify-icon icon="icomoon-free:bin" width={24}></iconify-icon>
					<span class="hidden md:inline">{button_delete()}</span>
				</Button>
			{/if}

			<div class="flex gap-2">
				<Button variant="outline" type="button" onclick={() => close?.(null)} disabled={isSubmitting}>
					{button_cancel()}
				</Button>
				<Button variant="tertiary"
					type="submit"
					aria-label={button_save()}
					disabled={isSubmitting}
				 class="dark:">
					{#if isSubmitting}
						<iconify-icon icon="eos-icons:loading" width={24} class="animate-spin"></iconify-icon>
					{/if}
					{button_save()}
				</Button>
			</div>
		</footer>
	</form>
</div>
