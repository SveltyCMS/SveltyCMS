<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';

	// Stores
	import { mode, entryData } from '@stores/store';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	const _data = $mode == 'create' ? {} : value;
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;
	$: updateTranslationProgress(_data, field);

	let validationError: string | null = null;

	export const WidgetData = async () => _data;

	// zod validation
	import * as z from 'zod';

	// Create a branded schema for email
	const Email = z.string().email().brand('Email');

	// Customize the error messages for each rule
	const validateSchema = z.object({
		// db_fieldName: z.string(),
		// icon: z.string().optional(),
		// color: z.string().optional(),
		// size: z.string().optional(),
		// width: z.number().optional(),
		// required: z.boolean().optional(),
		// Widget Specific
		// email: Email.refine((value) => value.includes('@'), {
		// 	message: 'Please enter a valid email address',
		// 	path: ['email']
		// })
	});

	let initialRender = true;

	function validateInput() {
		console.log('Before validation:', _data[_language]);
		if (initialRender) {
			initialRender = false;
		} else if (_data[_language] !== '') {
			try {
				validateSchema.parse(_data);
				validationError = ''; // Set error to null on successful validation
				console.log('Zod Validation Passed'); // New log for successful validation
			} catch (error: unknown) {
				if (error instanceof z.ZodError) {
					validationError = error.errors[0].message;
				}
			}
		} else {
			validationError = ''; // Clear error if empty string
		}
		console.log('After validation:', validationError);
	}
</script>

<input
	type="email"
	bind:value={_data[_language]}
	on:change={validateInput}
	name={field?.db_fieldName}
	id={field?.db_fieldName}
	placeholder={field?.placeholder && field?.placeholder !== '' ? field?.placeholder : field?.db_fieldName}
	class="input text-black dark:text-primary-500"
/>

<!-- Error Message -->
{#if validationError !== null}
	<p class="text-center text-sm text-error-500">{validationError}</p>
{/if}
