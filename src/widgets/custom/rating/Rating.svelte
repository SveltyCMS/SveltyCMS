<!-- 
@file src/widgets/custom/rating/Rating.svelte
@component
**Rating widget component to display a rating input.**

@example
<Rating label="Rating" db_fieldName="rating" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { validationStore } from '@stores/store.svelte';
	import { mode } from '@root/src/stores/collectionStore.svelte';

	// Skeleton
	import { Ratings } from '@skeletonlabs/skeleton';

	// Valibot validation
	import { number, pipe, parse, minValue, maxValue } from 'valibot';
	import { writable } from 'svelte/store';

	interface Props {
		field: FieldType;
		maxRating?: number;
		color?: string;
		size?: number;
		iconEmpty?: string;
		iconHalf?: string;
		iconFull?: string;
		value?: any;
	}

	let {
		field,
		maxRating = 5,
		color = 'warning-500',
		size = 25,
		iconEmpty = 'material-symbols:star-outline',
		iconHalf = 'material-symbols:star-half',
		iconFull = 'material-symbols:star',
		value = field.default ?? null
	}: Props = $props();

	const fieldName = getFieldName(field);

	// Initialize _data based on mode
	let _data = mode.value === 'create' ? {} : value;

	// Create a writable store for validation error
	const validationErrorStore = writable<string | null>(null);
	let debounceTimeout: number | undefined;

	// Create validation schema for rating
	const ratingSchema = pipe(number(), minValue(1, 'Rating must be at least 1 star'), maxValue(maxRating, `Rating cannot exceed ${maxRating} stars`));

	// Validation function
	function validateInput() {
		try {
			if (debounceTimeout) clearTimeout(debounceTimeout);
			debounceTimeout = window.setTimeout(() => {
				try {
					const value = _data.value;

					// First validate if required
					if (field?.required && (value === undefined || value === null)) {
						validationErrorStore.set('This field is required');
						validationStore.setError(fieldName, 'This field is required');
						return;
					}

					// Then validate the value
					if (value !== undefined && value !== null) {
						parse(ratingSchema, value);
						validationErrorStore.set(null);
						validationStore.clearError(fieldName);
					}
				} catch (err) {
					const message = err instanceof Error ? err.message : 'Invalid rating value';
					validationErrorStore.set(message);
					validationStore.setError(fieldName, message);
				}
			}, 300);
		} catch (err) {
			console.error('Validation error:', err);
		}
	}

	// Handle rating click
	function handleIconClick(event: CustomEvent<{ index: number }>): void {
		_data.value = event.detail.index;
		validateInput();
	}

	// Cleanup on destroy
	import { onDestroy } from 'svelte';

	onDestroy(() => {
		if (debounceTimeout) clearTimeout(debounceTimeout);
	});

	// Export WidgetData for data binding with Fields.svelte
	export const WidgetData = async () => _data;
</script>

<div class="input-container relative mb-4">
	<!-- Ratings -->
	<Ratings
		bind:value={_data.value}
		max={maxRating}
		interactive
		on:icon={handleIconClick}
		aria-invalid={$validationErrorStore}
		aria-describedby={$validationErrorStore ? `${fieldName}-error` : undefined}
		aria-required={field?.required}
		data-testid="rating-input"
	>
		{#snippet empty()}
			<iconify-icon icon={iconEmpty} width={size} {color}></iconify-icon>
		{/snippet}
		{#snippet half()}
			<iconify-icon icon={iconHalf} width={size} {color}></iconify-icon>
		{/snippet}
		{#snippet full()}
			<iconify-icon icon={iconFull} width={size} {color}></iconify-icon>
		{/snippet}
	</Ratings>

	<!-- Error Message -->
	{#if $validationErrorStore}
		<p id={`${field.db_fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{$validationErrorStore}
		</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		min-height: 2.5rem;
	}

	/* .error {
		border-color: rgb(239 68 68);
	} */
</style>
