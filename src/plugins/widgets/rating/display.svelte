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

	// Derived configuration
	const max = $derived(Math.max(1, Number(field.max) || 5));
	const showValue = $derived(field.showValue !== false);
	const iconFull = $derived((field.iconFull as string) || 'material-symbols:star');
	const iconHalf = $derived((field.iconHalf as string) || 'material-symbols:star-half');
	const iconEmpty = $derived((field.iconEmpty as string) || 'material-symbols:star-outline');

	// Create an array for looping
	const stars = $derived(Array.from({ length: max }, (_, i) => i + 1));
</script>

{#if typeof value === 'number' && value >= 0}
	<div class="rating-display" title="{value} out of {max} stars">
		<div class="flex items-center gap-0.5">
			{#each stars as starIndex}
				{#if starIndex <= Math.floor(value)}
					<iconify-icon icon={iconFull} width="20" class="text-warning-500"></iconify-icon>
				{:else if starIndex - 0.5 <= value}
					<iconify-icon icon={iconHalf} width="20" class="text-warning-500"></iconify-icon>
				{:else}
					<iconify-icon icon={iconEmpty} width="20" class="text-surface-300 dark:text-surface-600"></iconify-icon>
				{/if}
			{/each}
		</div>
		
		{#if showValue}
			<span class="ml-2 text-sm font-bold text-surface-700 dark:text-surface-300">
				{value.toFixed(value % 1 !== 0 ? 1 : 0)}
			</span>
		{/if}
	</div>
{:else}
	<span class="text-surface-400 dark:text-surface-600">–</span>
{/if}

<style>
	.rating-display {
		display: inline-flex;
		align-items: center;
		font-family: inherit;
	}
</style>
