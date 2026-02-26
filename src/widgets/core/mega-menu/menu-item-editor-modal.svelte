<!--
@file src/widgets/core/MegaMenu/MenuItemEditorModal.svelte
@component MenuItemEditorModal - Modal editor for individual MegaMenu items

Provides a focused interface for editing the fields associated with a specific 
menu item at a specific level. Uses the standard widget loading system.

@props
- `meta: MenuEditContext` - Context containing the item, its level, and configured fields.
-->

<script lang="ts">
	import WidgetLoader from '@src/components/collection-display/widget-loader.svelte';
	import { widgets } from '@src/stores/widget-store.svelte';
	import { modalState } from '@utils/modal-state.svelte';
	import { getFieldName } from '@utils/utils';
	import type { MenuEditContext } from './types';

	let { meta }: { meta: MenuEditContext } = $props();

	// Locally import modules for widget loading to support code-splitting
	const modules: Record<string, () => Promise<{ default: any }>> = import.meta.glob('/src/widgets/**/*.svelte') as Record<
		string,
		() => Promise<{ default: any }>
	>;

	/**
	 * Resolves the appropriate widget loader for a given widget name.
	 */
	function getWidgetLoader(widgetName: string) {
		if (!widgetName) return null;

		// 1. Try exact path from widget store
		const fn = widgets.widgetFunctions[widgetName];
		const storePath = (fn as any)?.componentPath || (fn as any)?.inputComponentPath;
		if (storePath && storePath in modules) {
			return modules[storePath];
		}

		// 2. Try normalized casing
		const normalized = widgetName.toLowerCase();
		for (const path in modules) {
			const lowerPath = path.toLowerCase();
			if (
				lowerPath.includes(`/widgets/core/${normalized}/input.svelte`) ||
				lowerPath.includes(`/widgets/core/${normalized}/index.svelte`) ||
				lowerPath.includes(`/widgets/custom/${normalized}/input.svelte`) ||
				lowerPath.includes(`/widgets/custom/${normalized}/index.svelte`)
			) {
				return modules[path];
			}
		}

		// 3. Last resort: search for anything ending in input.svelte within the widget's folder
		for (const path in modules) {
			if (path.toLowerCase().includes(`/${normalized}/input.svelte`)) {
				return modules[path];
			}
		}

		return null;
	}

	/**
	 * Persists changes and closes the modal.
	 */
	function onSave() {
		if (meta.onSave) {
			meta.onSave(meta.item._fields);
		}
		modalState.close();
	}

	/**
	 * Discards changes and closes the modal.
	 */
	function onCancel() {
		if (meta.onCancel) {
			meta.onCancel();
		}
		modalState.close();
	}
</script>

<div
	class="card p-4 w-modal shadow-xl space-y-6 max-h-[90vh] overflow-y-auto bg-surface-50 dark:bg-surface-900 border border-surface-200 dark:border-surface-700"
>
	<header class="flex items-center justify-between border-b border-surface-200 pb-3 dark:border-surface-700">
		<div class="flex flex-col">
			<h2 class="text-2xl font-bold text-surface-900 dark:text-surface-100">
				{meta.isNew ? 'Add' : 'Edit'} Menu Item
			</h2>
			<span class="text-xs font-medium uppercase tracking-wider text-surface-500">Level {meta.level + 1} Configuration</span>
		</div>
		<button
			type="button"
			class="btn-icon variant-soft-surface hover:variant-filled-surface transition-colors"
			onclick={onCancel}
			aria-label="Close modal"
		>
			<iconify-icon icon="mdi:close" width="24"></iconify-icon>
		</button>
	</header>

	<div class="space-y-6">
		{#if meta.fields && meta.fields.length > 0}
			<div class="grid grid-cols-1 gap-6">
				{#each meta.fields as field (getFieldName(field))}
					{@const fieldName = getFieldName(field)}
					{@const widgetName = field.widget?.Name || ''}
					{@const widgetLoader = getWidgetLoader(widgetName)}

					<div class="field-wrapper">
						{#if widgetLoader}
							<WidgetLoader loader={widgetLoader} {field} bind:value={meta.item._fields[fieldName]} />
						{:else}
							<div
								class="p-4 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded-lg text-error-700 dark:text-error-400 flex items-center gap-3"
							>
								<iconify-icon icon="mdi:alert-circle" width="24"></iconify-icon>
								<div>
									<p class="font-semibold text-sm">Widget Missing</p>
									<p class="text-xs opacity-80">Failed to load widget <strong>{widgetName}</strong> for field <strong>{field.label}</strong>.</p>
								</div>
							</div>
						{/if}
					</div>
				{/each}
			</div>
		{:else}
			<div
				class="p-12 text-center bg-surface-100/50 rounded-xl dark:bg-surface-800/50 border-2 border-dashed border-surface-200 dark:border-surface-700"
			>
				<iconify-icon icon="mdi:form-select" width="48" class="mx-auto block text-surface-300 dark:text-surface-600"></iconify-icon>
				<p class="mt-4 text-surface-600 dark:text-surface-300 font-medium">No fields configured for this level.</p>
				<p class="text-xs text-surface-500 mt-1">Configure fields in the collection schema to see them here.</p>
			</div>
		{/if}
	</div>

	<footer class="flex justify-end gap-3 border-t border-surface-200 pt-5 dark:border-surface-700">
		<button type="button" class="btn preset-outlined-surface-500" onclick={onCancel}> Discard </button>
		<button type="button" class="btn preset-filled-primary-500" onclick={onSave}>
			<iconify-icon icon="mdi:check" width="20" class="mr-2"></iconify-icon>
			Save Changes
		</button>
	</footer>
</div>

<style>
	.w-modal {
		width: 100%;
		max-width: 650px;
	}

	.field-wrapper :global(.widget-container) {
		background-color: transparent;
		padding: 0;
		border-style: none;
	}
</style>
