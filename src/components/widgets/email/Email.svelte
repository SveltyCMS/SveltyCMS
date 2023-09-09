<script lang="ts">
	import type { FieldType } from '.';
	import { defaultContentLanguage } from '@src/stores/store';
	import { mode, entryData } from '@src/stores/store';
	import { getFieldName } from '@src/utils/utils';

	export let field: FieldType;

	let fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};
	//console.log('value: ', value);

	let _data = $mode == 'create' ? {} : value;
	let _language = defaultContentLanguage;

	export const WidgetData = async () => _data;

	import * as z from 'zod';

	const emailSchema = z
		.string()
		.email()
		.refine((value) => value.includes('@'), {
			message: 'Please enter a valid email address'
		});

	let errorMessage = '';

	function validateEmail() {
		try {
			emailSchema.parse(_data[_language]);
			errorMessage = '';
		} catch (error: unknown) {
			if (error instanceof z.ZodError) {
				errorMessage = error.errors[0].message;
			}
		}
	}
</script>

<input
	type="email"
	bind:value={_data[_language]}
	on:input={validateEmail}
	name={field?.db_fieldName}
	id={field?.db_fieldName}
	placeholder={field?.placeholder && field?.placeholder !== ''
		? field?.placeholder
		: field?.db_fieldName}
	class="input"
/>
{#if errorMessage}
	<p class="text-center text-sm text-error-500">{errorMessage}</p>
{/if}
