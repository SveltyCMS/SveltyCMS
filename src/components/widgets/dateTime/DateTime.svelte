<!-- 
@file src/components/widgets/dateTime/DateTime.svelte
@description - DateTime widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { publicEnv } from '@root/config/public';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { validationStore } from '@stores/store';
	import { mode, collectionValue } from '@stores/collectionStore';

	// valibot validation
	import * as v from 'valibot';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $collectionValue[fieldName] || {};

	const _data = $mode === 'create' ? {} : value;
	const _language = publicEnv.DEFAULT_CONTENT_LANGUAGE;
	let validationError: string | null = null;
	let debounceTimeout: number | undefined;

	export const WidgetData = async () => _data;

	// Define the validation schema for this widget
	const widgetSchema = v.object({
		value: v.pipe(v.string(), v.regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Invalid date-time format, must be YYYY-MM-DDTHH:MM')),
		db_fieldName: v.string(),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
		size: v.optional(v.string()),
		width: v.optional(v.number()),
		required: v.optional(v.boolean())
	});

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(schema: typeof widgetSchema, data: any): string | null {
		try {
			v.parse(schema, data);
			validationStore.clearError(fieldName);
			return null; // No error
		} catch (error) {
			if (error instanceof v.ValiError) {
				const errorMessage = error.issues[0]?.message || 'Invalid input';
				validationStore.setError(fieldName, errorMessage);
				return errorMessage;
			}
			return 'Invalid input';
		}
	}

	// Debounced validation function
	function validateInput() {
		if (debounceTimeout) clearTimeout(debounceTimeout);
		debounceTimeout = window.setTimeout(() => {
			validationError = validateSchema(widgetSchema, { value: _data[_language] });
		}, 300);
	}
</script>

<!-- Date/Time Input -->
<input
	type="datetime-local"
	bind:value={_data[_language]}
	on:input|preventDefault={validateInput}
	class="input text-black dark:text-primary-500"
	aria-invalid={!!validationError}
	aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
/>

<!-- Error Message -->
{#if validationError}
	<p id={`${field.db_fieldName}-error`} class="text-center text-sm text-error-500">
		{validationError}
	</p>
{/if}
