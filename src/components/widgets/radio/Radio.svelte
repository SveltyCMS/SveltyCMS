<script lang="ts">
	import type { FieldType } from '.';
	import { contentLanguage, defaultContentLanguage } from '@src/stores/store';
	import { mode, entryData } from '@src/stores/store';
	import { getFieldName } from '@src/utils/utils';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	let _language = field?.translated ? $contentLanguage : defaultContentLanguage;

	export const WidgetData = async () => _data;

	import * as z from 'zod';

	var widgetValueObject = {
		db_fieldName: field.db_fieldName,
		icon: field.icon,
		color: field.color,
		width: field.width,
		required: field.required
	};

	const radioSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		color: z.string().optional(),
		width: z.string().optional(),
		required: z.boolean().optional()
	});

	let validationError: string | null = null;
	$: validationError = (() => {
		try {
			radioSchema.parse(widgetValueObject);
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	})();
</script>

<div class="form-check">
	<!-- TODO Fix Color and rounded-full for skeleton -->
	<!-- <label class="flex items-center space-x-2">
		<input
			class="radio"
			type="radio"
			checked
			name="radio-direct"
			color={field.color}
			bind:value={_data[_language]}
		/>
		<p>{field.label ? field.label : field.db_fieldName} skeleton</p>
	</label> -->

	<input
		bind:value={_data[_language]}
		class="form-check-input float-left mr-2 mt-1 h-4 w-4 cursor-pointer appearance-none rounded-full border border-surface-300 bg-white bg-contain bg-center bg-no-repeat align-top transition duration-200 checked:border-tertiary-600 checked:bg-tertiary-600 focus:outline-none"
		type="radio"
		name="flexRadioDefault"
		id="flexRadioDefault2"
		checked
		color={field.color}
		bind:group={value}
	/>
	<label class="form-check-label inline-block" for="flexRadioDefault2">
		{field.label ? field.label : field.db_fieldName}
	</label>
</div>

{#if validationError !== null}
	<p class="text-center text-sm text-error-500">{validationError}</p>
{/if}
