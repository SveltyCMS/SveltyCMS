<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';

	// Stores
	import { mode, entryData } from '@stores/store';

	import { getFieldName } from '@utils/utils';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	let _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;
	let validationError: string | null = null;

	export const WidgetData = async () => _data;

	// zod validation
	import * as z from 'zod';

	// Customize the error messages for each rule
	const validateSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		color: z.string().optional(),
		size: z.string().optional(),
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

<div class="variant-filled-surface btn-group flex w-full rounded">
	<input
		type="number"
		bind:value={_data[_language]}
		on:input={validateInput}
		name={field?.db_fieldName}
		id={field?.db_fieldName}
		placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
		required={field?.required}
		readonly={field?.readonly}
		class="input text-black dark:text-primary-500"
	/>
</div>

<!-- Error Message -->
{#if validationError !== null}
	<p class="text-center text-sm text-error-500">{validationError}</p>
{/if}
