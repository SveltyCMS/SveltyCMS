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
import { logger } from "@utils/logger";
	import type { FieldType } from './';
	import { fetchRelatedEntries, isHydratedRelation } from './fetch-related';

	const { field, value }: { field: FieldType; value: string | string[] | null | undefined } = $props();

	// Local state for the resolved entry's display text.
	let displayText = $state('Loading...');
	let isVisible = $state(false);
	let hasFetched = $state(false);
	let elementRef = $state<HTMLElement | null>(null);

	// Stub function for fetching entry display - implement with your API
	// Fetches the entry's display field value from the API.
	function labelFromEntry(entry: Record<string, unknown>): string | null {
		const raw = entry[field.displayField as string];
		if (raw === null || raw === undefined || raw === '') return null;
		return String(raw);
	}

	async function fetchEntryDisplays(ids: string[]): Promise<string[]> {
		if (!field.collection || !field.displayField) return [];
		try {
			const rows = await fetchRelatedEntries(String(field.collection), ids, [
				field.displayField as string,
			]);
			const byId = new Map(rows.map((row) => [String(row._id ?? ''), row]));
			const labels: string[] = [];
			for (const id of ids) {
				const row = byId.get(id);
				const label = row ? labelFromEntry(row) : null;
				if (label) labels.push(label);
			}
			return labels;
		} catch (e) {
			logger.error('[RelationDisplay] Failed to fetch entry display:', e);
			return [];
		}
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

		const raw = Array.isArray(value) ? value : value ? [value] : [];
		if (raw.length === 0) {
			displayText = '–';
			hasFetched = true;
			return;
		}

		const labels: string[] = [];
		const pendingIds: string[] = [];
		for (const item of raw) {
			if (isHydratedRelation(item)) {
				const label = labelFromEntry(item);
				if (label) labels.push(label);
				continue;
			}
			if (typeof item === 'string' && item) pendingIds.push(item);
		}

		if (pendingIds.length === 0) {
			displayText = labels.join(', ') || '–';
			hasFetched = true;
			return;
		}

		fetchEntryDisplays(pendingIds).then((fetched) => {
			displayText = [...labels, ...fetched].join(', ') || '–';
			hasFetched = true;
		});
	});
</script>

{#snippet ghostRelation()}
	<span bind:this={elementRef} class="ghost-relation transition-opacity duration-300" class:opacity-50={!hasFetched}>
		{displayText}
	</span>
{/snippet}

{@render ghostRelation()}

