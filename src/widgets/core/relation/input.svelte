<!--
@file src/widgets/core/Relation/Input.svelte
@component
**Relation Widget Input Component**

Provides entry selection interface with modal-based browsing and relationship management.
Part of the Three Pillars Architecture for widget system.

@example
<RelationInput bind:value={relationId} field={fieldDefinition} />
Interactive selector with "Select" button and clear functionality

### Props
- `field: FieldType` - Widget field definition with collection and display field config
- `value: string | string[] | null | undefined` - Entry ID(s) for relations (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **Modal Selection**: Skeleton Labs modal integration for entry browsing
- **Single/Multi Relations**: Handles both single and array-based relations
- **Async Entry Loading**: Fetches full entry data for display preview
- **Clear Functionality**: Easy removal of selected relations with × button
- **Multilingual Display**: Shows display field in current content language
- **Loading States**: Handles async data loading with proper UX
- **Error Handling**: Accessible error display with ARIA attributes
- **Collection Filtering**: Scoped to specific collection as configured
-->

<script lang="ts">
	import { app } from "@src/stores/store.svelte";
	import { showModal } from "@utils/modal-utils";
	import type { FieldType } from "./";
	import RelationModal from "./relation-modal.svelte";
	import { slide, fade } from "svelte/transition";

	let {
		field,
		value = $bindable(),
		error,
	}: {
		field: FieldType;
		value: string | string[] | null | undefined;
		error?: string | null;
	} = $props();

	// Local state for the resolved entry's display text.
	let selectedEntries = $state<Record<string, any>[]>([]);
	let loadingData = $state(false);
	const lang = $derived(app.contentLanguage);

	// Real implementation for fetching entry data
	async function fetchEntryData(ids: string[]): Promise<Record<string, any>[]> {
		if (ids.length === 0) return [];
		loadingData = true;
		try {
			// Use the filter search to get exactly these IDs
			const filter = JSON.stringify({ _id: { $in: ids } });
			const res = await fetch(`/api/collections/${field.collection}?filter=${encodeURIComponent(filter)}&limit=${ids.length}`);
			const result = await res.json();
			if (res.ok && result.success) {
				return result.data || [];
			}
			return [];
		} catch (err) {
			console.error("Failed to fetch relation entries:", err);
			return [];
		} finally {
			loadingData = false;
		}
	}

	// Fetch the full entry data when the ID `value` changes.
	$effect(() => {
		const ids = Array.isArray(value) ? value : value ? [value] : [];
		if (ids.length > 0) {
			fetchEntryData(ids).then((entries) => {
				// Deduplicate just in case
				const uniqueMap = new Map();
				selectedEntries = entries.filter(e => {
					const id = (e._id || e.id).toString();
					if(!uniqueMap.has(id)) {
						uniqueMap.set(id, true);
						return true;
					}
					return false;
				});
			});
		} else {
			selectedEntries = [];
		}
	});

	// Function to open the selection/creation modal.
	function openRelationModal() {
		showModal({
			component: RelationModal,
			props: {
				collectionID: field.collection,
				displayField: field.displayField,
				multiple: field.multiple,
				selectedIds: Array.isArray(value) ? value : value ? [value] : [],
			},
			response: (selected: string[] | undefined) => {
				if (selected !== undefined) {
					if (field.multiple) {
						value = selected;
					} else {
						value = selected.length > 0 ? selected[0] : null;
					}
				}
			},
		});
	}

	function removeItem(id: string) {
		const idStr = id.toString();
		if (Array.isArray(value)) {
			value = value.filter((v) => v.toString() !== idStr);
		} else if (value?.toString() === idStr) {
			value = null;
		}
	}
</script>

<div class="relation-container flex flex-col gap-3 rounded-xl border border-surface-500/20 bg-surface-50/30 p-4 dark:bg-surface-900/30" class:border-error-500={error}>
	<!-- Selected Items List -->
	<div class="flex flex-wrap gap-2" in:fade>
		{#if selectedEntries.length > 0}
			{#each selectedEntries as entry (entry._id || entry.id)}
				<div 
					class="chip variant-filled-surface flex items-center gap-2 py-1.5 pl-3 pr-2 shadow-sm transition-all duration-200 hover:scale-[1.02]"
					transition:slide={{ axis: 'x', duration: 200 }}
				>
					<span class="max-w-[150px] truncate font-medium">
						{entry[field.displayField as string]?.[lang] || entry[field.displayField as string] || 'Entry ' + (entry._id || entry.id)}
					</span>
					<button
						onclick={() => removeItem(entry._id || entry.id)}
						type="button"
						class="btn-icon btn-icon-sm hover:preset-filled-error-500 rounded-full w-5 h-5 transition-colors"
						aria-label="Remove"
					>
						<iconify-icon icon="mdi:close" width="14"></iconify-icon>
					</button>
				</div>
			{/each}
		{:else if !loadingData}
			<div class="flex items-center gap-2 text-sm opacity-50 italic py-1 px-1">
				<iconify-icon icon="mdi:link-variant-off" width="16"></iconify-icon>
				No entries selected
			</div>
		{/if}
		
		{#if loadingData}
			<div class="flex items-center gap-2 text-sm text-primary-500 animate-pulse py-1 px-1">
				<iconify-icon icon="line-md:loading-twotone-loop" width="16"></iconify-icon>
				Loading...
			</div>
		{/if}
	</div>

	<!-- Action Button -->
	<div class="actions">
		<button 
			onclick={openRelationModal} 
			type="button" 
			class="btn btn-sm preset-filled-tertiary-500 dark:preset-filled-primary-500 flex items-center gap-2 group transition-all duration-300 active:scale-95"
		>
			<iconify-icon 
				icon={field.multiple ? 'mdi:plus-circle-outline' : 'mdi:swap-horizontal'} 
				width="18"
				class="group-hover:rotate-180 transition-transform duration-500"
			></iconify-icon>
			<span class="font-bold">
				{field.multiple ? 'Add Related Entries' : selectedEntries.length > 0 ? 'Change Selection' : 'Select Related Entry'}
			</span>
		</button>
	</div>

	{#if error}
		<p class="text-error-500 text-xs mt-1 flex items-center gap-1" role="alert">
			<iconify-icon icon="mdi:alert-circle-outline"></iconify-icon>
			{error}
		</p>
	{/if}
</div>

<style>
	.relation-container {
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}
	
	.relation-container:focus-within {
		border-color: rgba(var(--color-primary-500) / 0.5);
		box-shadow: 0 4px 12px -2px rgba(var(--color-primary-500) / 0.1);
	}
</style>
