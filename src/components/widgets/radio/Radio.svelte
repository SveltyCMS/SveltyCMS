<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';

	// Stores
	import { mode, entryData, contentLanguage } from '@stores/store';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;

	$: _language = field?.translated ? $contentLanguage : publicEnv.DEFAULT_CONTENT_LANGUAGE;
	$: updateTranslationProgress(_data, field);

	let validationError: string | null = null;

	export const WidgetData = async () => _data;

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
			validateSchema.parse(_data[_language]);
			validationError = '';
		} catch (error: unknown) {
			if (error instanceof z.ZodError) {
				validationError = error.errors[0].message;
			}
		}
	}
</script>

<div class="flex w-full items-center gap-2">
	<!-- Radio -->
	<input
		id="radio"
		type="radio"
		bind:value={_data.value}
		on:input={validateInput}
		checked
		color={field.color}
		class="input float-left mr-4 mt-1 h-4 w-4 cursor-pointer appearance-none rounded-full border border-surface-300 bg-white bg-contain bg-center bg-no-repeat align-top text-black transition duration-200 checked:border-tertiary-600 checked:bg-tertiary-600 focus:outline-none dark:text-white"
	/>

	<!-- Label  -->
	<input
		type="text"
		id="label for radio"
		on:input={validateInput}
		placeholder="Define Label"
		bind:value={_data[_language]}
		class="input text-black dark:text-primary-500"
	/>
</div>

<!-- Error Message -->
{#if validationError !== null}
	<p class="text-center text-sm text-error-500">{validationError}</p>
{/if}
