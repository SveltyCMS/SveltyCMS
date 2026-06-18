<!--
@file src/widgets/core/MegaMenu/MenuItemEditorModal.svelte
@component MenuItemEditorModal - Modal editor for individual MegaMenu items

Provides a focused interface for editing the fields associated with a specific 
menu item at a specific level. Uses the standard widget loading system.

@props
- `meta: MenuEditContext` - Context containing the item, its level, and configured fields.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import { widgets } from '@src/stores/widget-store.svelte';
	import { getCachedWidgetInputLoader } from '@widgets/widget-loader-registry';
	import { modalState } from '@utils/modal.svelte';
	import { getFieldName } from '@utils/utils';
	import type { MenuEditContext } from './types';

	let { meta }: { meta: MenuEditContext } = $props();

	/**
	 * Resolves the appropriate widget loader for a given widget name.
	 */
	function getWidgetLoader(widgetName: string) {
		return getCachedWidgetInputLoader(widgetName, widgets.widgetFunctions);
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
		<Button variant="surface"
			type="button"
			onclick={onCancel}
			aria-label="Close modal"
		 class="p-0! min-w-0 hover:">
			<iconify-icon icon="mdi:close" width="24"></iconify-icon>
		</Button>
	</header>

	<div class="space-y-6">
		{#if meta.fields && meta.fields.length > 0}
			<div class="grid grid-cols-1 gap-6">
				{#each meta.fields as field (getFieldName(field))}
					{const fieldName = getFieldName(field)}
					{const widgetName = field.widget?.Name || ''}
					{const widgetLoader = getWidgetLoader(widgetName)}

					<div class="field-wrapper">
						{#if widgetLoader}
							{#await import('@src/components/collection-display/widget-loader.svelte') then { default: WidgetLoader }}
								<WidgetLoader loader={widgetLoader} {field} bind:value={meta.item._fields[fieldName]} />
							{/await}
						{:else}
							<div
								class="p-4 bg-error-50 dark:bg-error-900/20 border border-error-200 dark:border-error-800 rounded text-error-700 dark:text-error-500 flex items-center gap-3"
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
				class="p-12 text-center bg-surface-100/50 rounded dark:bg-surface-800/50 border-2 border-dashed border-surface-200 dark:border-surface-700"
			>
				<iconify-icon icon="mdi:form-select" width="48" class="mx-auto block text-surface-300 dark:text-surface-600"></iconify-icon>
				<p class="mt-4 text-surface-600 dark:text-surface-300 font-medium">No fields configured for this level.</p>
				<p class="text-xs text-surface-500 mt-1">Configure fields in the collection schema to see them here.</p>
			</div>
		{/if}
	</div>

	<footer class="flex justify-end gap-3 border-t border-surface-200 pt-5 dark:border-surface-700">
		<Button variant="outline" type="button" onclick={onCancel}> Discard </Button>
		<Button variant="tertiary" type="button" onclick={onSave} class="dark:">
			<iconify-icon icon="mdi:check" width="20" class="mr-2"></iconify-icon>
			Save Changes
		</Button>
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
