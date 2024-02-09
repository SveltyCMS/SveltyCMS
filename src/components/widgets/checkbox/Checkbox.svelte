<script lang="ts">
	// Stores
	import { mode, entryData, contentLanguage, defaultContentLanguage } from '@stores/store';

	import type { FieldType } from '.';

	import { getFieldName } from '@utils/utils';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};
	//console.log('value: ', value);

	let _data = $mode == 'create' ? {} : value;
	let _language = field?.translated ? $contentLanguage : defaultContentLanguage;

	export const WidgetData = async () => _data;

	import * as z from 'zod';

	var widgetValueObject = {
		db_fieldName: field.db_fieldName,
		icon: field.icon,
		color: field.color,
		size: field.size,
		width: field.width,
		required: field.required
	};

	const checkboxSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		color: z.string().optional(),
		size: z.string().optional(),
		width: z.number().optional(),
		required: z.boolean().optional()
	});

	let validationError: string | null = null;

	$: validationError = (() => {
		try {
			checkboxSchema.parse(widgetValueObject);
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	})();
</script>

<div class="mb-4 flex items-center">
	<input
		id="default-checkbox"
		type="checkbox"
		color={field.color}
		bind:value={_data[_language]}
		class="h-[${field.size}] w-[${field.size}] rounded border-surface-300 bg-surface-100 text-tertiary-600 focus:ring-2 focus:ring-tertiary-500 dark:border-surface-600 dark:bg-surface-700 dark:ring-offset-surface-800 dark:focus:ring-tertiary-600"
		bind:checked={value}
	/>
	<label for="default-checkbox" class="ml-2 text-sm font-medium text-surface-900 dark:text-surface-300"
		>{field.label ? field.label : field.db_fieldName}</label
	>
	{#if validationError !== null}
		<p class="text-error-500">{validationError}</p>
	{/if}
</div>
