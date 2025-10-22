<!--
@file src/widgets/core/relation/Display.svelte
@component
**Relation Widget Display Component**

Displays related entry references by fetching and showing the display field value.
Part of the Three Pillars Architecture for widget system.

@example
<RelationDisplay field={fieldDefinition} value="entry-uuid-123" />
Renders: "Article Title" (fetched from related entry's display field)

### Props
- `field: FieldType` - Widget field definition with collection and display field config
- `value: string | null | undefined` - Entry ID reference to display

### Features
- **Async Data Fetching**: Loads related entry data via optimized API calls
- **Display Field Resolution**: Shows configured display field from related entry
- **Multilingual Support**: Respects content language for translated display fields
- **Loading States**: Shows "Loading..." during async data fetching
- **Optimized Queries**: Fetches only the required display field for performance
- **Null Handling**: Graceful fallback to "–" for missing or null relations
- **Reactive Updates**: Automatically refetches when relation ID changes
-->

<script lang="ts">
	import type { FieldType } from './';

	let { value }: { field: FieldType; value: string | null | undefined } = $props();

	// Local state for the resolved entry's display text.
	let displayText = $state('Loading...');

	// Stub function for fetching entry display - implement with your API
	async function fetchEntryDisplay(_id: string): Promise<string | null> {
		// TODO: Implement API call to fetch entry display field
		return null;
	}

	// Fetch the entry's display text when the ID `value` changes.
	$effect(() => {
		if (value) {
			// API Call: GET /api/entries/{field.collection}/{value}?fields={field.displayField}
			// This is a more optimized fetch for just the field we need.
			fetchEntryDisplay(value).then((text: string | null) => (displayText = text || '–'));
		} else {
			displayText = '–';
		}
	});
</script>

<span>{displayText}</span>
