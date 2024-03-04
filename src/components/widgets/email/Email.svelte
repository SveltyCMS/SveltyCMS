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

	export const WidgetData = async () => _data;

	// zod validation
	import * as z from 'zod';

	// Create a branded schema for email
	const Email = z.string().email().brand('Email');

	// Customize the error messages for each rule
	const validateSchema = Email.refine((value) => value.includes('@'), {
		message: 'Please enter a valid email address',
		path: ['email']
	});

	let validationError: string | null = null;

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

<input
	type="email"
	bind:value={_data[_language]}
	on:input={validateInput}
	name={field?.db_fieldName}
	id={field?.db_fieldName}
	placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
	class="input"
/>
{#if validationError !== null}
	<p class="text-center text-sm text-error-500">{validationError}</p>
{/if}
