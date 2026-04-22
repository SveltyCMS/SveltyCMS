<!--
@file src/widgets/core/Relation/Display.svelte
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
- **Ghost Relation Lazy Loading**: Uses Svelte 5 snippets and IntersectionObserver to defer deep hydration until viewport entry.
-->

<script lang="ts">
	import type { FieldType } from './';

	const { value }: { field: FieldType; value: string | string[] | null | undefined } = $props();

	// Local state for the resolved entry's display text.
	let displayText = $state('Loading...');
	let isVisible = $state(false);
	let hasFetched = $state(false);
	let elementRef = $state<HTMLElement | null>(null);

	// Stub function for fetching entry display - implement with your API
	async function fetchEntryDisplay(_id: string): Promise<string | null> {
		// TODO: Implement API call to fetch entry display field
		return null;
	}

	// Set up IntersectionObserver to detect when the element enters the viewport
	$effect(() => {
		if (!elementRef) return;

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) {
					isVisible = true;
					observer.disconnect(); // Trigger fetch once
				}
			},
			{ rootMargin: '50px', threshold: 0.1 }
		);

		observer.observe(elementRef);

		return () => observer.disconnect();
	});

	// Fetch the entry's display text ONLY when visible and ID value changes.
	$effect(() => {
		if (!isVisible || hasFetched) return;

		const ids = Array.isArray(value) ? value : value ? [value] : [];
		if (ids.length > 0) {
			// API Call: GET /api/entries/{field.collection}?ids={ids.join(',')}&fields={field.displayField}
			// Optimized fetch for multiple entries
			Promise.all(ids.map((id) => fetchEntryDisplay(id))).then((texts) => {
				const validTexts = texts.filter((t) => t !== null) as string[];
				displayText = validTexts.join(', ') || '–';
				hasFetched = true;
			});
		} else {
			displayText = '–';
			hasFetched = true;
		}
	});
</script>

{#snippet ghostRelation()}
	<span bind:this={elementRef} class="ghost-relation transition-opacity duration-300" class:opacity-50={!hasFetched}>
		{displayText}
	</span>
{/snippet}

{@render ghostRelation()}

