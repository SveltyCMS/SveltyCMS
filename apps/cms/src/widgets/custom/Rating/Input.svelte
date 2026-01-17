<!--
@file src/widgets/custom/Rating/Input.svelte
@component
**Rating Widget Input Component**

Provides interactive star rating input using Skeleton Labs Ratings component.
Part of the Three Pillars Architecture for widget system.

@example
<RatingInput bind:value={rating} field={{ max: 5, iconFull: "star", iconEmpty: "star-outline" }} />
Interactive star rating with hover states and click selection

### Props
- `field: FieldType` - Widget field definition with max rating and icon configuration
- `value: number | null | undefined` - Selected rating value (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **Skeleton Labs Integration**: Professional Ratings component with built-in interactions
- **Interactive Stars**: Click and hover states for intuitive rating selection
- **Customizable Icons**: Configurable full/empty star icons via Iconify
- **Flexible Rating Scale**: Supports any maximum rating value with step="1"
- **Accessibility**: Full ARIA support with labels and error association
- **Error State Styling**: Visual error indication with red star coloring
- **Snippet Customization**: Custom empty and full star rendering
- **Responsive Design**: Adapts to different screen sizes and contexts
- **PostCSS Styling**: Modern CSS with utility-first approach
-->

<script lang="ts">
	import { RatingGroup } from '@skeletonlabs/skeleton-svelte';
	import type { FieldType } from './';

	let { field, value = $bindable(), error }: { field: FieldType; value?: number | null | undefined; error?: string | null } = $props();

	// Handle undefined/null value by defaulting to 0 for the component, but strictly binding back
	// However, if we want to allow "no selection", we might need to handle undefined.
	// Skeleton Ratings usually binds to a number.
	let ratingValue = $state(value ?? 0);

	$effect(() => {
		if (value !== undefined && value !== null) {
			ratingValue = value;
		}
	});

	// Sync ratingValue back to prop value
	$effect(() => {
		value = ratingValue;
	});
</script>

<div
	class="relative inline-block w-full rounded border p-2 border-surface-400 dark:border-surface-400"
	class:!border-error-500={!!error}
	class:invalid={!!error}
>
	<div class={error ? ' text-error-500' : ''}>
		<RatingGroup value={ratingValue} onValueChange={(e) => (ratingValue = e.value)} aria-label={field.label}>
			<RatingGroup.Control>
				{#each { length: Number(field.max) || 5 } as _, i}
					<RatingGroup.Item index={i + 1}>
						{#snippet empty()}
							<iconify-icon icon={field.iconEmpty || 'material-symbols:star-outline'} width="24" class="text-surface-400"></iconify-icon>
						{/snippet}
						{#snippet full()}
							<iconify-icon icon={field.iconFull || 'material-symbols:star'} width="24" class={error ? 'text-error-500' : 'text-warning-500'}
							></iconify-icon>
						{/snippet}
					</RatingGroup.Item>
				{/each}
			</RatingGroup.Control>
		</RatingGroup>
	</div>

	{#if error}
		<p class="absolute bottom-0 left-0 w-full text-center text-xs text-error-500" role="alert">{error}</p>
	{/if}
</div>
