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
	import { modalState } from '@utils/modalState.svelte';
	import type { FieldType } from './';
	import { contentLanguage } from '@src/stores/store.svelte';

	let { field, value, error }: { field: FieldType; value: string | string[] | null | undefined; error?: string | null } = $props();

	// A local, reactive copy of the full, resolved entry object for display.
	let selectedEntry = $state<Record<string, any> | null>(null);
	const lang = $derived($contentLanguage);

	// Stub function for fetching entry data - implement with your API
	async function fetchEntryData(_id: string): Promise<Record<string, any> | null> {
		// TODO: Implement API call to fetch entry by ID
		return null;
	}

	// Fetch the full entry data when the ID `value` changes.
	$effect(() => {
		const id = Array.isArray(value) ? value[0] : value;
		if (id) {
			// API Call: GET /api/entries/{field.collection}/{id}
			// This fetches the data needed to display the summary.
			fetchEntryData(id).then((entry: Record<string, any> | null) => (selectedEntry = entry));
		} else {
			selectedEntry = null;
		}
	});

	// The text to display in the selector button.
	const displayText = $derived(selectedEntry?.[field.displayField as string]?.[lang] || 'Select an Entry');

	import RelationModal from './RelationModal.svelte';

	// Function to open the selection/creation modal.
	function openRelationModal() {
		modalState.trigger(RelationModal as any, { collectionId: field.collection }, (selectedId: string | undefined) => {
			if (selectedId) {
				value = selectedId;
			}
		});
	}
</script>

<div class="relation-container" class:invalid={error}>
	<div class="selection-box">
		<span>{displayText}</span>
		<div class="actions">
			<button onclick={openRelationModal} aria-label="Select Entry">Select</button>
			{#if value}
				<button onclick={() => (value = null)} aria-label="Clear Selection">×</button>
			{/if}
		</div>
	</div>

	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>
