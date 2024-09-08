<!-- 
@file src/components/widgets/colorPicker/ColorPicker.svelte
@description - ColorPicker widget
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { mode, entryData, validationStore } from '@stores/store';

	// zod validation
	import * as z from 'zod';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	export let field: FieldType;

	const fieldName = getFieldName(field);
	export let value = $entryData[fieldName] || {};

	const _data = $mode === 'create' ? {} : value;
	let validationError: string | null = null;
	let debounceTimeout: number | undefined;

	export const WidgetData = async () => _data;

	// Define the validation schema for this widget
	const widgetSchema = z.object({
		color: z.string().regex(/^#[0-9A-F]{6}$/i, 'Invalid color format, must be a valid HEX code'),
		db_fieldName: z.string(),
		icon: z.string().optional(),
		size: z.string().optional(),
		width: z.number().optional(),
		required: z.boolean().optional()
	});

	// Generic validation function that uses the provided schema to validate the input
	function validateSchema(schema: z.ZodSchema, data: any): string | null {
		try {
			schema.parse(data);
			validationStore.clearError(fieldName);
			return null; // No error
		} catch (error) {
			if (error instanceof z.ZodError) {
				const errorMessage = error.errors[0]?.message || 'Invalid input';
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
			validationError = validateSchema(widgetSchema, _data);
		}, 300);
	}
</script>

<div class="flex w-full items-center gap-2">
	<!-- Color picker -->
	<input
		type="color"
		bind:value={_data.color}
		class="h-11 w-11 rounded border-0"
		on:input={validateInput}
		aria-label="Color picker"
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
	/>

	<!-- Hex Value -->
	<input
		type="text"
		bind:value={_data.color}
		on:input={validateInput}
		placeholder={m.colorPicker_hex()}
		class="input text-black dark:text-primary-500"
		aria-label="Hex color value"
		aria-invalid={!!validationError}
		aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
	/>
</div>

<!-- Error Message -->
{#if validationError}
	<p id={`${field.db_fieldName}-error`} class="text-center text-sm text-error-500">
		{validationError}
	</p>
{/if}
