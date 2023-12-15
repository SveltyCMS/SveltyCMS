<script lang="ts">
	import type { FieldType } from '.';
	import { mode, entryData, contentLanguage, defaultContentLanguage } from '@stores/store';
	import { getFieldName } from '@utils/utils';

	import * as z from 'zod';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	let _language = field?.translated ? $contentLanguage : defaultContentLanguage;
	let endDateValue: any;

	export const WidgetData = async () => _data;

	var widgetValueObject = {
		db_fieldName: field.db_fieldName,
		icon: field.icon,
		required: field.required
	};

	const dateSchema = z.object({
		db_fieldName: z.string(),
		icon: z.string().optional(),
		required: z.boolean().optional()
	});

	let validationError: string | null = null;

	$: validationError = (() => {
		try {
			dateSchema.parse(widgetValueObject);
			return null;
		} catch (error) {
			return (error as Error).message;
		}
	})();
</script>

<!-- TODO: Enhance Date entry -->
<label for="start-date">Start Date:</label>
<input id="start-date" type="date" bind:value={_data[_language]} class="input rounded-md" />

<label for="end-date">End Date:</label>
<input id="end-date" type="date" bind:value={endDateValue} class="input rounded-md" />

{#if validationError !== null}
	<p class="text-error-500">{validationError}</p>
{/if}
