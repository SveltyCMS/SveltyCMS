<!--
@file src/widgets/custom/Rating/Input.svelte
@component
**Rating Widget Input Component**

Provides interactive star rating input using the native Rating component.
Part of the Three Pillars Architecture for widget system.

@example
<RatingInput bind:value={rating} field={{ max: 5, iconFull: "star", iconEmpty: "star-outline" }} />
Interactive star rating with hover states and click selection

### Props
- `field: FieldType` - Widget field definition with max rating and icon configuration
- `value: number | null | undefined` - Selected rating value (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **Native Rating Component**: Professional Ratings component with built-in interactions
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
	import Rating from "@components/ui/rating.svelte";
	import type { FieldType } from './';

	let {
		field,
		value = $bindable(),
		error
	}: {
		field: FieldType;
		value?: number | null | undefined;
		error?: string | null;
	} = $props();

	// Derived properties from field config
	const max = $derived(Math.max(1, Number(field.max) || 5));
	const step = $derived(Number(field.step) || 1);
	const showValue = $derived(field.showValue !== false);

	// Icon handling - support full names or legacy material-symbols stripping
	const iconFull = $derived((field.iconFull as string) || 'material-symbols:star');
	const iconEmpty = $derived((field.iconEmpty as string) || 'material-symbols:star-outline');

	// Local bindable rating synced with prop value
	let localRating = $state(typeof value === 'number' ? value : 0);

	$effect(() => {
		const propVal = typeof value === 'number' ? value : 0;
		localRating = propVal;
	});

	$effect(() => {
		value = localRating === 0 && !field.required ? null : localRating;
	});

	function handleClear() {
		value = field.required ? 1 : null;
	}
</script>

<div
	class="relative flex flex-col gap-2 rounded-lg border p-3 border-surface-400 dark:border-surface-600 bg-white dark:bg-surface-900 transition-all"
	class:ring-2={!!error}
	class:ring-error-500={!!error}
	class:border-error-500={!!error}
>
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
		<Rating
				bind:value={localRating}
				count={max}
				icon={iconFull}
				iconEmpty={iconEmpty}
				color={error ? 'text-error-500' : 'text-warning-500'}
				aria-label={field.label}
			/>

			{#if showValue}
				<span class="text-lg font-bold text-surface-900 dark:text-surface-50 min-w-8 text-center">
					{value?.toFixed(step === 0.5 ? 1 : 0) || '0'}
				</span>
			{/if}
		</div>

		{#if !field.required || (value !== null && value !== undefined)}
			<button
				type="button"
				class="btn btn-sm variant-soft-surface p-1 opacity-60 hover:opacity-100 transition-opacity"
				onclick={handleClear}
				title="Reset Rating"
			>
				<iconify-icon icon="mdi:refresh" width="18"></iconify-icon>
			</button>
		{/if}
	</div>

	{#if error}
		<p class="text-xs text-error-500 font-medium" role="alert">{error}</p>
	{/if}
</div>

<style>
	/* Custom styles to ensure RatingGroup looks good with our theme */
	:global(.rating-group-control) {
		display: flex;
		gap: 0.125rem;
	}
</style>
