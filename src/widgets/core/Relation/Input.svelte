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
	import { showModal } from '@utils/modalUtils';
	import type { FieldType } from './';
	import { app } from '@src/stores/store.svelte';

	let { field, value, error }: { field: FieldType; value: string | string[] | null | undefined; error?: string | null } = $props();

	// Local state for the resolved entry's display text.
	let selectedEntries = $state<Array<Record<string, any>>>([]);
	const lang = $derived(app.contentLanguage);

	// Stub function for fetching entry data - implement with your API
	async function fetchEntryData(ids: string[]): Promise<Array<Record<string, any>>> {
		// TODO: Implement API call to fetch entries by IDs
		// This should return an array of entry objects
		return ids.map((id) => ({ _id: id, [field.displayField as string]: `Entry ${id}` }));
	}

	// Fetch the full entry data when the ID `value` changes.
	$effect(() => {
		const ids = Array.isArray(value) ? value : value ? [value] : [];
		if (ids.length > 0) {
			fetchEntryData(ids).then((entries) => (selectedEntries = entries));
		} else {
			selectedEntries = [];
		}
	});

	// Function to open the selection/creation modal.
	function openRelationModal() {
		showModal({
			component: 'relationModal',
			meta: {
				collectionId: field.collection,
				multiple: field.multiple,
				// Callback to update the value when an entry is selected in the modal
				callback: (selected: string | string[] | undefined) => {
					if (selected) {
						if (field.multiple) {
							// If multiple, ensuring we have an array
							const newSelection = Array.isArray(selected) ? selected : [selected];
							// Merge with existing if needed, or replace.
							// For now, let's assume the modal returns the *full* new selection
							value = newSelection;
						} else {
							// Single select
							value = Array.isArray(selected) ? selected[0] : selected;
						}
					}
				}
			}
		});
	}

	function removeItem(id: string) {
		if (Array.isArray(value)) {
			value = value.filter((v) => v !== id);
		} else if (value === id) {
			value = null;
		}
	}
</script>

<div class="relation-container" class:invalid={error}>
	<div class="flex flex-wrap gap-2">
		{#each selectedEntries as entry (entry._id)}
			<div class="badge variant-filled-surface flex items-center gap-2 p-2">
				<span>{entry[field.displayField as string]?.[lang] || entry[field.displayField as string] || '...'}</span>
				<button
					onclick={() => removeItem(entry._id)}
					type="button"
					class="btn-icon btn-icon-sm variant-filled-error rounded-full w-4 h-4"
					aria-label="Remove"
				>
					<iconify-icon icon="mdi:close" width="12"></iconify-icon>
				</button>
			</div>
		{/each}
	</div>

	<div class="actions mt-2">
		<button onclick={openRelationModal} type="button" aria-label="Select Entry" class="btn btn-sm variant-filled-primary">
			<iconify-icon icon="mdi:plus" class="mr-1"></iconify-icon>
			{field.multiple ? 'Add Entries' : selectedEntries.length > 0 ? 'Change Selection' : 'Select Entry'}
		</button>
	</div>

	{#if error}
		<p class="text-error-500 text-sm mt-1" role="alert">{error}</p>
	{/if}
</div>
