<!-- 
@file src/components/widgets/rating/Rating.svelte
@description - Rating widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { validationStore } from '@stores/store';
	import { mode, collectionValue } from '@stores/collectionStore';

	// Skeleton
	import { Ratings } from '@skeletonlabs/skeleton';

	// Valibot validation
	import { number, pipe, parse, type ValiError, minValue, maxValue, nonNullable } from 'valibot';

	export let field: FieldType;

	export let maxRating = 5;
	export let color = 'warning-500';
	export let size = 25;
	export let iconEmpty = 'material-symbols:star-outline';
	export let iconHalf = 'material-symbols:star-half';
	export let iconFull = 'material-symbols:star';

	const fieldName = getFieldName(field);
	export let value = $collectionValue[fieldName] || {};

	// Initialize _data based on mode
	const _data = $mode === 'create' ? {} : value;

	let validationError: string | null = null;
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
						validationError = 'This field is required';
						validationStore.setError(fieldName, validationError);
						return;
					}

					// Then validate rating if value exists
					if (value !== undefined && value !== null) {
						parse(ratingSchema, value);
					}

					validationError = null;
					validationStore.clearError(fieldName);
				} catch (error) {
					if ((error as ValiError<typeof ratingSchema>).issues) {
						const valiError = error as ValiError<typeof ratingSchema>;
						validationError = valiError.issues[0]?.message || 'Invalid input';
						validationStore.setError(fieldName, validationError);
					}
				}
			}, 300);
		} catch (error) {
			console.error('Validation error:', error);
			validationError = 'An unexpected error occurred during validation';
			validationStore.setError(fieldName, 'Validation error');
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
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${fieldName}-error` : undefined}
		aria-required={field?.required}
		data-testid="rating-input"
	>
		<svelte:fragment slot="empty"><iconify-icon icon={iconEmpty} width={size} {color}></iconify-icon></svelte:fragment>
		<svelte:fragment slot="half"><iconify-icon icon={iconHalf} width={size} {color}></iconify-icon></svelte:fragment>
		<svelte:fragment slot="full"><iconify-icon icon={iconFull} width={size} {color}></iconify-icon></svelte:fragment>
	</Ratings>

	<!-- Error Message -->
	{#if validationError}
		<p id={`${field.db_fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		min-height: 2.5rem;
	}

	.error {
		border-color: rgb(239 68 68);
	}
</style>
