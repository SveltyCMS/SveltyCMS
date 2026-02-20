<!--
@file src/widgets/custom/ColorPicker/Input.svelte
@component
**ColorPicker Widget Input Component**

Provides a color selection interface using native HTML color input or custom swatch picker.
Part of the Three Pillars Architecture for widget system.

@example
<ColorPickerInput bind:value={selectedColor} field={fieldDefinition} />
Renders a color input with label, helper, and validation

### Props
- `field: FieldType` - Widget field definition with label, helper, etc.
- `value: string | null | undefined` - Selected color value (bindable)

### Features
- **Semantic HTML**: Uses proper input and label markup
- **Color Selection**: Native color input or custom swatch
- **Required Field Indicators**: Visual asterisk for mandatory fields
- **Tailwind Styling**: Utility-first CSS for layout and color
- **Screen Reader Support**: Proper ARIA attributes and semantic markup
-->
<script lang="ts">
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { app, validationStore } from '@src/stores/store.svelte';
	import { colorPicker_hex } from '@src/paraglide/messages';
	import { getFieldName } from '@utils/utils';
	// Unified error handling
	import { handleWidgetValidation } from '@widgets/widget-error-handler';

	// Valibot validation
	import { optional, parse, pipe, regex, string } from 'valibot';
	import type { FieldType } from './';

	let {
		field,
		value = $bindable(),
		error
	}: {
		field: FieldType;
		value?: string | null | undefined | Record<string, string>;
		error?: string | null;
	} = $props();

	const _language = $derived(field.translated ? app.contentLanguage : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase());

	// Local state for the hex value
	let localValue = $state<string>('');

	// Sync localValue from parent value
	$effect(() => {
		const parentVal = value;
		let extracted = '#000000'; // Default

		if (field.translated && typeof parentVal === 'object' && parentVal !== null) {
			extracted = (parentVal as Record<string, any>)[_language] ?? '#000000';
		} else if (!field.translated && typeof parentVal === 'string') {
			extracted = parentVal;
		} else if (!parentVal) {
			// Initialize if empty
			updateParent('#000000');
			return;
		}

		if (extracted !== localValue) {
			localValue = extracted;
		}
	});

	// Update parent value when localValue changes
	function updateParent(newVal: string) {
		if (field.translated) {
			if (!value || typeof value !== 'object') {
				value = {};
			}
			value = { ...(value as object), [_language]: newVal };
		} else {
			value = newVal;
		}
		// Validate hex color format
		validateColor(newVal);
	}

	// Validation
	const fieldName = $derived(getFieldName(field));
	const validationError = $derived(validationStore.getError(fieldName));

	// Hex color schema (accepts #RGB, #RRGGBB, #RGBA, #RRGGBBAA)
	const hexColorSchema = $derived(
		field?.required
			? pipe(string(), regex(/^#([0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/, 'Invalid hex color format (e.g., #FFF or #FFFFFF)'))
			: optional(pipe(string(), regex(/^#([0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/, 'Invalid hex color format')), '')
	);

	function validateColor(colorValue: string) {
		if (!(colorValue || field?.required)) {
			validationStore.clearError(fieldName);
			return;
		}
		handleWidgetValidation(() => parse(hexColorSchema, colorValue), {
			fieldName,
			updateStore: true
		});
	}
</script>

<div class="relative rounded p-1" class:invalid={error || validationError}>
	<div class="flex items-center rounded gap-0.5 border border-surface-400 pr-1">
		<input
			type="color"
			id="{field.db_fieldName}-picker"
			name="{field.db_fieldName}-picker"
			value={localValue}
			oninput={(e) => updateParent(e.currentTarget.value)}
			class="pl-2 h-9 w-9 shrink-0 cursor-pointer border-none bg-transparent p-0"
			aria-label="{field.label} Color Picker"
		/>

		<div class="relative grow">
			<input
				type="text"
				id={field.db_fieldName}
				name={field.db_fieldName}
				value={localValue}
				oninput={(e) => updateParent(e.currentTarget.value)}
				placeholder={colorPicker_hex()}
				class="w-full grow border-none bg-transparent font-mono outline-none focus:outline-none"
				aria-label="{field.label} Hex Value"
			/>
		</div>
	</div>
	{#if error || validationError}
		<p class="absolute bottom-0 left-0 w-full text-center text-xs text-error-500" role="alert">{error || validationError}</p>
	{/if}
</div>
