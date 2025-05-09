<!-- 
@file src/widgets/custom/colorPicker/ColorPicker.svelte
@component
**ColorPicker widget component to display color field**

@example
<ColorPicker label="Color" db_fieldName="color" required={true} />

### Props
- `field`: FieldType
- `value`: any

### Features
- Translatable
-->

<script lang="ts">
	import type { FieldType } from '.';
	import { getFieldName } from '@utils/utils';

	// Stores
	import { validationStore } from '@stores/store.svelte';
	import { mode } from '@stores/collectionStore.svelte';

	// valibot validation
	import * as v from 'valibot';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	interface Props {
		field: FieldType;
		value?: any;
	}
	let { field, value = {} }: Props = $props();

	const fieldName = getFieldName(field);

	const _data = $state(mode.value === 'create' ? {} : value);
	let validationError: string | null = $state(null);
	let debounceTimeout: number | undefined;

	export const WidgetData = async () => _data;

	// Define the validation schema for this widget
	const widgetSchema = v.object({
		color: v.pipe(v.string(), v.regex(/^#[0-9A-F]{6}$/i, 'Invalid color format, must be a valid HEX code')),
		db_fieldName: v.string(),
		icon: v.optional(v.string()),
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
			validationError = validateSchema(widgetSchema, _data);
		}, 300);
	}
</script>

<div class="input-container relative mb-4">
	<div class="flex w-full items-center gap-2">
		<!-- Color picker -->
		<input
			type="color"
			bind:value={_data.color}
			class="h-11 w-11 rounded border-0"
			class:error={!!validationError}
			oninput={validateInput}
			aria-label="Color picker"
			aria-invalid={!!validationError}
			aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
		/>

		<!-- Hex Value -->
		<input
			type="text"
			bind:value={_data.color}
			oninput={validateInput}
			placeholder={m.colorPicker_hex()}
			class="input text-black dark:text-primary-500"
			class:error={!!validationError}
			aria-label="Hex color value"
			aria-invalid={!!validationError}
			aria-describedby={validationError ? `${field.db_fieldName}-error` : undefined}
		/>
	</div>

	<!-- Error Message -->
	{#if validationError}
		<p id={`${field.db_fieldName}-error`} class="absolute bottom-[-1rem] left-0 w-full text-center text-xs text-error-500" role="alert">
			{validationError}
		</p>
	{/if}
</div>

<style lang="postcss">
	.input-container {
		min-height: 2.5rem;
	}

	.error {
		border-color: rgb(239 68 68);
	}
</style>
