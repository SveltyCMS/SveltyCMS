<script lang="ts">
	import type { FieldType } from '.';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { mode, entryData } from '@stores/store';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
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
		required: z.boolean().optional(),

		// Widget Specfic
		checked: z.boolean(),
		label: z.string().min(1, 'Label cannot be empty')
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

<div class="flex w-full items-center gap-2">
	<!-- Color picker -->
	<input type="color" bind:value={_data.value} class="input" />

	<!-- Hex Value -->
	<input
		type="text"
		bind:value={_data.value}
		on:input={validateInput}
		placeholder={m.colorPicker_hex()}
		class="input text-black dark:text-primary-500"
	/>
</div>

<!-- Error Message -->
{#if validationError !== null}
	<p class="text-center text-sm text-error-500">{validationError}</p>
{/if}
