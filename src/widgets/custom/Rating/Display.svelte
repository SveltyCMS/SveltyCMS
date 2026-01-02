<!--
@file src/widgets/custom/Rating/Display.svelte
@component
**Rating Widget Display Component**

Displays numeric ratings as visual star ratings with customizable icons and colors.
Part of the Three Pillars Architecture for widget system.

@example
<RatingDisplay field={{ max: 5 }} value={4} />
Renders: ★★★★☆ (4 filled stars, 1 empty star)

### Props
- `field: FieldType` - Widget field definition with max rating and icon configuration
- `value: number | null | undefined` - Numeric rating value to display

### Features
- **Visual Star Display**: Converts numeric ratings to intuitive star representations
- **Customizable Icons**: Configurable full/empty star icons via Iconify
- **Flexible Rating Scale**: Supports any maximum rating value (default 5 stars)
- **Accessibility**: Descriptive title attributes showing exact rating values
- **Color Coding**: Warning/gold colors for filled stars, gray for empty
- **Null Handling**: Graceful fallback to "–" for missing ratings
- **Responsive Layout**: Inline-flex layout with proper spacing
- **PostCSS Styling**: Modern CSS with utility-first approach
-->

<script lang="ts">
	import type { FieldType } from './';

	const { field, value }: { field: FieldType; value: number | null | undefined } = $props();

	// Create an array to easily loop for displaying stars.
	const stars = $derived.by(() => Array(field.max || 5).fill(0));
</script>

{#if typeof value === 'number' && value > 0}
	<div class="display-wrapper" title="{value} out of {field.max || 5} stars">
		{#each stars as _, i}
			{#if i < value}
				<iconify-icon icon={field.iconFull || 'material-symbols:star'} class="text-warning-500"></iconify-icon>
			{:else}
				<iconify-icon icon={field.iconEmpty || 'material-symbols:star-outline'} class="text-gray-300"></iconify-icon>
			{/if}
		{/each}
	</div>
{:else}
	<span>–</span>
{/if}

<style>
	.display-wrapper {
		display: inline-flex;
		align-items: center;
		gap: 0.125rem; /* 2px */
	}
</style>
