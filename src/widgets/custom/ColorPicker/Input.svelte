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
	import { tokenTarget } from '@src/actions/tokenTarget';

	let { field, value, error }: { field: FieldType; value: string | null | undefined; error?: string | null } = $props();

	// If the value is initially null or undefined, default it to black.
	if (!value) {
		value = '#000000';
	}
</script>

<div class="container" class:invalid={error}>
	<div class="wrapper">
		<input type="color" id={field.db_fieldName} name={field.db_fieldName} bind:value class="swatch" aria-label="Color Picker Swatch" />

		<div class="relative flex-grow">
			<input
				type="text"
				bind:value
				placeholder={m.colorPicker_hex()}
				class="hex-input w-full"
				aria-label="Hex Color Value"
				use:tokenTarget={{
					name: field.db_fieldName,
					label: field.label,
					collection: (field as any).collection
				}}
			/>
			<iconify-icon icon="mdi:code-braces" class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-surface-400" width="16"
			></iconify-icon>
		</div>
	</div>
	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>

<style lang="postcss">
	.container {
		position: relative;
		padding-bottom: 1.5rem;
	}
	.wrapper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 2px;
	}
	.container.invalid .wrapper {
		border-color: #ef4444;
	}
	.swatch {
		flex-shrink: 0;
		width: 2.25rem;
		height: 2.25rem;
		border: none;
		padding: 0;
		background: none;
		cursor: pointer;
	}
	.hex-input {
		flex-grow: 1;
		border: none;
		outline: none;
		background: none;
		font-family: monospace;
	}
	.error-message {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		text-align: center;
		font-size: 0.75rem;
		color: #ef4444;
	}
</style>
