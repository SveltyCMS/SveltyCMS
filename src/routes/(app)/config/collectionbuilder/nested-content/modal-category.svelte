<!--
@file src/routes/(app)/config/collectionbuilder/NestedContent/ModalCategory.svelte
@component
**Modal dialog for creating and editing categories in the collection builder.**

Features:
- Two-column layout: form fields on left, icon picker + live preview on right
- Description/subtitle field for richer metadata
- Icon picker with fallback default
- AdminCard wrapping with proper theme tokens
- Full validation with ARIA error messages
- Delete cascade support for editing existing categories
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

	import type { ContentNode } from "@root/src/databases/db-interface";
	import Button from "@components/ui/button.svelte";
	import Input from "@components/ui/input.svelte";
	import AdminCard from "@components/admin-card.svelte";

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
		newCategoryName: string;
		newCategoryIcon: string;
		newCategoryDescription: string;
	}

	const DEFAULT_ICON = "mdi:folder-outline";

	const { existingCategory = { name: "", icon: "" }, close }: Props = $props();

	// State variables for form and UI
	const formData = $state<FormData>({
		newCategoryName: "",
		newCategoryIcon: "",
		newCategoryDescription: "",
	});
	let categoryIconSearch = $state("");
	let isSubmitting = $state(false);
	let formError = $state<string | null>(null);
	let validationErrors = $state<Record<string, string>>({});

	// Populate form when editing
	$effect(() => {
		formData.newCategoryName = existingCategory.name ?? "";
		formData.newCategoryIcon = existingCategory.icon ?? DEFAULT_ICON;
		formData.newCategoryDescription = (existingCategory as any)?.description ?? "";
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
	 */
	async function onFormSubmit(event: Event): Promise<void> {
		event.preventDefault();
		if (!validateForm()) {
			logger.error("Form validation failed.", validationErrors);
			return;
		}

		isSubmitting = true;
		formError = null;

		try {
			if (close) {
				// Ensure a fallback icon for new categories
				if (!formData.newCategoryIcon) {
					formData.newCategoryIcon = DEFAULT_ICON;
				}
				close(formData);
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
	 * Cascades to all attached collections and subcategories.
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

		const bodyText =
			attachedCount > 0
				? `Delete category "${existingCategory.name}" and all ${attachedCount} attached collection(s) and sub-categories? Their config files will be removed. This action cannot be undone.`
				: `Are you sure you wish to delete the category "${existingCategory.name}"? This action cannot be undone.`;

		const confirmed = confirm(bodyText);
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

	// Live preview derived state
	const previewIcon = $derived(formData.newCategoryIcon || DEFAULT_ICON);
	const isEditing = $derived(!!existingCategory._id);
</script>

<div class="modal-category-container min-w-[32rem] sm:min-w-[40rem] md:min-w-[48rem]">
	{#if formError}
		<div class="mb-4 rounded-md bg-error-500/10 p-3 text-sm text-error-600 dark:text-error-400" role="alert">
			{formError}
		</div>
	{/if}

	<form onsubmit={onFormSubmit} class="flex flex-col gap-6">
		<!-- Two-column layout -->
		<div class="grid grid-cols-1 gap-6 md:grid-cols-5">
			<!-- Left column: Form fields (3/5 width) -->
			<div class="flex flex-col gap-4 md:col-span-3">
				<AdminCard class="p-5 space-y-4">
					<h3 class="text-sm font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wide">
						Category Details
					</h3>

					<Input
						type="text"
						id="category_name"
						bind:value={formData.newCategoryName}
						label={modalcategory_categoryname()}
						placeholder={modalcategory_placeholder()}
						error={validationErrors.name}
						disabled={isSubmitting}
						data-testid="category-name-input"
					/>

					<!-- Description field -->
					<Input
						type="text"
						id="category_description"
						bind:value={formData.newCategoryDescription}
						label="Description"
						placeholder="Brief description of this category (optional)"
						disabled={isSubmitting}
						data-testid="category-description-input"
					/>

					<!-- Slug/Path field (read-only, computed from name) -->
					<Input
						type="text"
						id="category_slug"
						value={formData.newCategoryName
							.trim()
							.toLowerCase()
							.replace(/\s+/g, "-")
							.replace(/[^a-z0-9-]/g, "") || "category"}
						label="Path (auto-generated)"
						disabled={true}
						class="opacity-70"
						data-testid="category-slug-display"
					/>
				</AdminCard>
			</div>

			<!-- Right column: Icon picker + Preview (2/5 width) -->
			<div class="flex flex-col gap-4 md:col-span-2">
				<!-- Icon Picker Card -->
				<AdminCard class="p-5 space-y-4">
					<h3 class="text-sm font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wide">
						Icon
					</h3>

					<label class="block" for="icon-picker">
						<span class="mb-2 block text-sm font-medium text-surface-700 dark:text-surface-200">
							Choose an icon
						</span>
						<div class="min-h-[220px]">
							<IconifyIconsPicker
								bind:iconselected={formData.newCategoryIcon}
								icon={previewIcon}
								bind:searchQuery={categoryIconSearch}
							/>
						</div>
						{#if validationErrors.icon}
							<span id="icon-error" class="mt-1 block text-xs text-error-500">{validationErrors.icon}</span>
						{/if}
					</label>
				</AdminCard>

				<!-- Live Preview Card -->
				<AdminCard class="p-5 space-y-3">
					<h3 class="text-sm font-semibold text-surface-600 dark:text-surface-300 uppercase tracking-wide">
						Preview
					</h3>
					<div
						class="flex items-center gap-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/50 p-4"
						data-testid="category-preview"
					>
						<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-500/10 text-primary-600 dark:text-primary-500">
							<iconify-icon icon={previewIcon} width="28" height="28"></iconify-icon>
						</div>
						<div class="min-w-0 flex-1">
							<div class="truncate text-base font-semibold text-surface-900 dark:text-surface-100">
								{formData.newCategoryName || "Category name"}
							</div>
							{#if formData.newCategoryDescription}
								<div class="truncate text-xs text-surface-500 dark:text-surface-400">
									{formData.newCategoryDescription}
								</div>
							{/if}
						</div>
					</div>
				</AdminCard>
			</div>
		</div>

		<!-- Footer -->
		<footer class="flex items-center border-t border-surface-200 pt-4 dark:border-surface-700 {isEditing ? 'justify-between' : 'justify-end'}">
			{#if isEditing}
				<Button
					variant="error"
					type="button"
					onclick={deleteCategory}
					aria-label="Delete category"
					disabled={isSubmitting}
				>
					<iconify-icon icon="icomoon-free:bin" width={20}></iconify-icon>
					<span class="hidden sm:inline">{button_delete()}</span>
				</Button>
			{/if}

			<div class="flex gap-2">
				<Button variant="outline" type="button" onclick={() => close?.(null)} disabled={isSubmitting}>
					{button_cancel()}
				</Button>
				<Button
					variant="tertiary"
					type="submit"
					aria-label={button_save()}
					disabled={isSubmitting}
					data-testid="category-save-button"
				>
					{#if isSubmitting}
						<iconify-icon icon="eos-icons:loading" width={20} class="animate-spin"></iconify-icon>
					{/if}
					{button_save()}
				</Button>
			</div>
		</footer>
	</form>
</div>
