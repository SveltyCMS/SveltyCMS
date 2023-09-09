<script lang="ts">
	import type { FieldType } from '.';
	import { PUBLIC_CONTENT_LANGUAGES } from '$env/static/public';
	import { contentLanguage, defaultContentLanguage } from '@src/stores/store';
	import { mode, entryData } from '@src/stores/store';
	import { getFieldName } from '@src/utils/utils';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	let _data = $mode == 'create' ? {} : value;
	let _language = field?.translated ? $contentLanguage : defaultContentLanguage;

	export const WidgetData = async () => _data;

	// TODO: Allow User/System to define Date formate
	let format = 'ddd, D MMMM YYYY HH:mm';

	// Use the language variable to determine the desired date format
	//$: format = date.formats[language];

	import * as z from 'zod';

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
<input type="datetime-local" bind:value={_data[_language]} class="input rounded-md" />
{#if validationError !== null}
	<p class="text-error-500">{validationError}</p>
{/if}
