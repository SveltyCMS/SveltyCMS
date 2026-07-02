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
	import Button from '@components/ui/button.svelte';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { app } from '@src/stores/store.svelte';
	import { getFieldName } from '@utils/utils';
	import { handleWidgetValidation } from '@widgets/widget-error-handler';
	import { parse, pipe, regex, string, optional } from 'valibot';
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

	const LANGUAGE = $derived(field.translated ? app.contentLanguage : ((publicEnv.DEFAULT_CONTENT_LANGUAGE as string) || 'en').toLowerCase());

	// Derived current color value
	const colorValue = $derived.by(() => {
		if (field.translated && value && typeof value === 'object') {
			return (value as Record<string, string>)[LANGUAGE] || (field as any).defaultColor || '#000000';
		}
		return typeof value === 'string' ? value : (field as any).defaultColor || '#000000';
	});

	// Validation
	const fieldName = $derived(getFieldName(field));
	const hexSchema = pipe(string(), regex(/^#[0-9a-f]{6}$/i, 'Must be a valid 6-digit hex code'));

	function updateColor(newColor: string) {
		const normalized = newColor.toUpperCase();

		if (field.translated) {
			value = { ...(typeof value === 'object' ? value : {}), [LANGUAGE]: normalized };
		} else {
			value = normalized;
		}

		// Immediate validation
		handleWidgetValidation(() => parse(field.required ? hexSchema : optional(hexSchema), normalized), {
			fieldName,
			updateStore: true
		});
	}

	function handleReset() {
		updateColor((field as any).defaultColor || '#000000');
	}
</script>

<div class="color-picker-widget flex flex-col gap-1">
	<div
		class="flex items-center gap-2 rounded border p-1 transition-all bg-white dark:bg-surface-900 border-surface-400 dark:border-surface-600 focus-within:ring-2 focus-within:ring-primary-500"
		class:!border-error-500={!!error}
		class:ring-2={!!error}
		class:ring-error-500={!!error}
	>
		<div class="relative h-10 w-10 shrink-0 overflow-hidden rounded border border-surface-200 dark:border-surface-700">
			<input aria-label="Color picker"
				type="color"
				value={colorValue}
				id={fieldName + '-color'}
				aria-label={field.label || 'Pick color'}
				oninput={(e) => updateColor(e.currentTarget.value)}
				class="absolute -inset-2 h-[150%] w-[150%] cursor-pointer border-none bg-transparent p-0"
			/>
		</div>

		<div class="flex grow items-center gap-2 px-2">
			<span class="text-surface-400 font-mono">#</span>
			<input aria-label="Color hex value"
				type="text"
				value={colorValue.replace('#', '')}
				id={fieldName + '-hex'}
				aria-label={field.label ? field.label + ' hex value' : 'Hex color value'}
				oninput={(e) => updateColor('#' + e.currentTarget.value)}
				placeholder="000000"
				maxlength="6"
				class="w-full grow border-none bg-transparent font-mono text-sm uppercase outline-none focus:ring-0"
			/>
		</div>

		<Button
			variant="surface"
			size="sm"
			type="button"
			class="p-1! me-1"
			onclick={handleReset}
			title="Reset to default"
		>
			<iconify-icon icon="mdi:refresh" width="18"></iconify-icon>
		</Button>
	</div>

	{#if error}
		<p class="text-[10px] font-medium text-error-500 px-1" role="alert">{error}</p>
	{/if}
</div>
