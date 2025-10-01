<!--
@file src/widgets/custom/rating/Input.svelte
@component
**Rating Widget Input Component**

Provides interactive star rating input using Skeleton Labs Ratings component.
Part of the Three Pillars Architecture for enterprise-ready widget system.

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
	import { Ratings } from '@skeletonlabs/skeleton';
	import type { FieldType } from './';

	let { field, value = $bindable(), error }: { field: FieldType; value?: number | null | undefined; error?: string | null } = $props();

	// Local value to handle null conversion
	let localValue = $state<number | undefined>(value ?? undefined);

	// Sync local value with prop
	$effect(() => {
		localValue = value ?? undefined;
	});

	// Sync prop with local value
	$effect(() => {
		if (localValue !== undefined) {
			value = localValue;
		}
	});
</script>

<div class="rating-container" class:invalid={error}>
	<Ratings
		max={Number(field.max) || undefined}
		step="1"
		interactive
		bind:value={localValue}
		aria-label={field.label}
		aria-describedby={error ? `${field.db_fieldName}-error` : undefined}
	>
		{#snippet empty()}
			<iconify-icon icon={field.iconEmpty || 'material-symbols:star-outline'} width="24" class="text-gray-400"></iconify-icon>
		{/snippet}
		{#snippet full()}
			<iconify-icon icon={field.iconFull || 'material-symbols:star'} width="24" class="text-warning-500"></iconify-icon>
		{/snippet}
	</Ratings>

	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>

<style lang="postcss">
	.rating-container {
		position: relative;
		display: inline-block;
		padding-bottom: 1.5rem;
	}
	.rating-container.invalid :global(iconify-icon) {
		/* Example: make stars red on error */
		color: #ef4444;
	}
	.error-message {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		text-align: center;
		font-size: 0.75rem;
		color: #ef4444;
	}
</style>
