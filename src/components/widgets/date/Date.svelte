<script lang="ts">
	import { date } from 'typesafe-i18n/formatters';
	import { language } from '$src/stores/store';

	export let field: any = undefined;
	export let value = '';

	export let widgetValue;
	$: widgetValue = value;

	// TODO: Allow User/System to define Date formate
	let format = 'ddd, MMMM D, YYYY';

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
<input type="date" bind:value class="input rounded-md" />
{#if validationError !== null}
	<p class="text-red-500">{validationError}</p>
{/if}
