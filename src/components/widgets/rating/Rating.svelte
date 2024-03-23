<script lang="ts">
	import type { FieldType } from '.';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { mode, entryData } from '@stores/store';

	// Skeleton
	import { Ratings } from '@skeletonlabs/skeleton';

	export let field: FieldType;

	export let maxRating = 5;
	export let color = 'warning-500';
	export let size = 25;
	export let iconEmpty = 'material-symbols:star-outline';
	export let iconHalf = 'material-symbols:star-half';
	export let iconFull = 'material-symbols:star';

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	let validationError: string | null = null;

	function iconClick(event: CustomEvent<{ index: number }>): void {
		value.current = event.detail.index;
	}

	// zod validation
	import * as z from 'zod';

	// Customize the error messages for each rule
	const validateSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		color: z.string().optional(),
		width: z.number().optional(),
		required: z.boolean().optional()

		// Widget Specfic
	});

	function validateInput() {
		try {
			// Change .parseAsync to .parse
			validateSchema.parse(_data.value);
			validationError = '';
		} catch (error: unknown) {
			if (error instanceof z.ZodError) {
				validationError = error.errors[0].message;
			}
		}
	}
</script>

<!-- Ratings -->
<Ratings bind:value={_data.value} on:input={validateInput} max={maxRating} interactive on:icon={iconClick}>
	<svelte:fragment slot="empty"><iconify-icon icon={iconEmpty} width={size} {color} /></svelte:fragment>
	<svelte:fragment slot="half"><iconify-icon icon={iconHalf} width={size} {color} /></svelte:fragment>
	<svelte:fragment slot="full"><iconify-icon icon={iconFull} width={size} {color} /></svelte:fragment>
</Ratings>

<!-- Error Message -->
{#if validationError !== null}
	<p class="text-center text-sm text-error-500">{validationError}</p>
{/if}
