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
	import type { FieldType } from './';
	import * as m from '@src/paraglide/messages';
	let { field, value, error }: { field: FieldType; value: string | null | undefined; error?: string | null } = $props();

	// If the value is initially null, undefined, or empty, default it to black.
	$effect(() => {
		if (!value) {
			value = '#000000';
		}
	});
</script>

<div class="relative rounded p-1" class:invalid={error}>
	<div class="flex items-center rounded gap-0.5 border border-surface-400 pr-1">
		<input
			type="color"
			id={field.db_fieldName}
			name={field.db_fieldName}
			bind:value
			class="pl-2 h-9 w-9 shrink-0 cursor-pointer border-none bg-transparent p-0"
			aria-label="Color Picker"
		/>

		<div class="relative grow">
			<input
				type="text"
				bind:value
				placeholder={m.colorPicker_hex()}
				class="w-full grow border-none bg-transparent font-mono outline-none focus:ring-0"
				aria-label="Hex Color Value"
			/>
		</div>
	</div>
	{#if error}
		<p class="absolute bottom-0 left-0 w-full text-center text-xs text-error-500" role="alert">{error}</p>
	{/if}
</div>
