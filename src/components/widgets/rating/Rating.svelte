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

	// valibot validation
	import * as v from 'valibot';

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

	// Define the validation schema for the rating widget
	const widgetSchema = v.object({
		value: v.optional(
			v.pipe(v.number(), v.minValue(1, 'Rating must be at least 1 star'), v.maxValue(maxRating, `Rating cannot exceed ${maxRating} stars`))
		),
		db_fieldName: v.string(),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
		width: v.optional(v.number()),
		required: v.optional(v.boolean())
	});

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(schema: typeof widgetSchema, data: any): string | null {
		try {
			v.parse(schema, data);
			validationStore.clearError(fieldName);
			return null; // No error
		} catch (error) {
			if (error instanceof v.ValiError) {
				const errorMessage = error.issues[0]?.message || 'Invalid input';
				validationStore.setError(fieldName, errorMessage);
				return errorMessage;
			}
			return 'Invalid input';
		}
	}

	// Handle rating click with debounce
	function handleIconClick(event: CustomEvent<{ index: number }>): void {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			_data.value = event.detail.index;
			validateInput();
		}, 300);
	}

	// Validate the input using the generic validateSchema function
	function validateInput() {
		validationError = validateSchema(widgetSchema, { value: _data.value });
	}

	// Export WidgetData for data binding with Fields.svelte
	export const WidgetData = async () => _data;
</script>

<!-- Ratings -->
<Ratings
	bind:value={_data.value}
	max={maxRating}
	interactive
	on:icon={handleIconClick}
	aria-invalid={!!validationError}
	aria-describedby={validationError ? `${fieldName}-error` : undefined}
>
	<svelte:fragment slot="empty"><iconify-icon icon={iconEmpty} width={size} {color}></iconify-icon></svelte:fragment>
	<svelte:fragment slot="half"><iconify-icon icon={iconHalf} width={size} {color}></iconify-icon></svelte:fragment>
	<svelte:fragment slot="full"><iconify-icon icon={iconFull} width={size} {color}></iconify-icon></svelte:fragment>
</Ratings>

<!-- Error Message -->
{#if validationError}
	<p id={`${fieldName}-error`} class="text-center text-sm text-error-500">
		{validationError}
	</p>
{/if}
