<!-- 
@file src/components/widgets/email/Email.svelte
@description - Email widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { updateTranslationProgress, getFieldName } from '@utils/utils';
	// Stores
	import { mode, entryData, validationStore } from '@stores/store';

	// zod validation
	import * as z from 'zod';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	const _data = $mode == 'create' ? {} : value;
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;
	$: updateTranslationProgress(_data, field);

	let validationError: string | null = null;
	// let apiKey: string | null = null;
	// let trialExpired = false;

	export const WidgetData = async () => _data;

	// Create a branded schema for email
	const Email = z.string().email().brand('Email');

	// Customize the error messages for each rule
	const validateSchema = Email.refine((value) => value.includes('@'), {
		message: 'Please enter a valid email address',
		path: ['email']
	});

	let initialRender = true;

	// async function fetchApiKey() {
	// 	const response = await fetch(`/api/getApiKey/email`);
	// 	if (response.ok) {
	// 		const data = await response.json();
	// 		apiKey = data.apiKey;
	// 	} else {
	// 		const data = await response.json();
	// 		if (data.error === 'Trial period expired') {
	// 			trialExpired = true;
	// 		} else {
	// 			console.error('Failed to fetch API key:', data.error);
	// 		}
	// 	}
	// }

	// fetchApiKey();

	async function validateInput() {
		if (initialRender) {
			initialRender = false;
		} else if (_data[_language] !== '') {
			try {
				validateSchema.parse(_data);
				validationError = ''; // Set error to null on successful validation

				// if (apiKey) {
				// 	console.log('Using API key:', apiKey);
				// } else if (trialExpired) {
				// 	validationError = 'Trial period expired';
				// } else {
				// 	console.error('API key is missing');
				// }
			} catch (error: unknown) {
				if (error instanceof z.ZodError) {
					validationError = error.errors[0].message;
				}
			}
		} else {
			validationError = ''; // Clear error if empty string
		}
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
