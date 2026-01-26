<!--
@file src/widgets/core/Checkbox/Input.svelte
@component
**Checkbox Widget Input Component**

Provides a boolean toggle interface using semantic HTML checkbox input.
Part of the Three Pillars Architecture for widget system.

@example
<CheckboxInput bind:checked={selectedValue} field={fieldDefinition} />
Renders a checkbox with label, color, size, and helper text from field props

### Props
- `field: FieldType` - Widget field definition with color, size, legend, and validation
- `value: boolean | null | undefined` - Checked state (bindable)

### Features
- **Semantic HTML**: Uses proper `<fieldset>` and `<legend>` for accessibility
- **Boolean Toggle**: Native HTML checkbox input with Svelte binding
- **Required Field Indicators**: Visual asterisk for mandatory fields
- **Flexible Color/Size**: Supports color and size from configuration
- **Error State Styling**: Visual error indication with accessible messaging
- **Tailwind Styling**: Modern design with utility-first CSS approach
- **Screen Reader Support**: Proper ARIA attributes and semantic markup
-->
<script lang="ts">
	import type { FieldType } from '.';
	import { validationStore } from '@src/stores/store.svelte';
	import { getFieldName } from '@src/utils/utils';
	let {
		field,
		value = $bindable()
	}: {
		field: FieldType;
		value: boolean | string | null | undefined;
	} = $props();

	// Initialize with proper boolean value if undefined
	$effect(() => {
		if (value === undefined || value === null) {
			value = false;
		}
	});

	const fieldName = $derived(getFieldName(field));

	// Update parent value and clear any validation errors
	function handleChange(e: Event) {
		const checked = (e.currentTarget as HTMLInputElement).checked;
		value = checked;
		validationStore.clearError(fieldName);
	}
</script>

<div class="mb-4">
	<fieldset
		id={field.db_fieldName}
		class="rounded border border-surface-500 p-2 dark:border-surface-400"
		aria-describedby={field.helper ? `${field.db_fieldName}-helper` : undefined}
	>
		<!-- Legend -->
		<legend
			class="mx-auto block w-fit px-2 text-center text-sm font-normal text-surface-700 dark:text-surface-50"
			style="background:none;border:none;"
		>
			{field.legend || 'Select one option'}
		</legend>

		<!-- Checkbox -->
		<div class="flex flex-col gap-y-2">
			<label class="flex cursor-pointer items-center gap-2 text-base text-surface-800 dark:text-surface-50">
				<input
					type="checkbox"
					name={field.db_fieldName}
					required={field.required}
					checked={!!value}
					onchange={handleChange}
					class={`h-5 w-5 cursor-pointer rounded border-gray-300 transition-colors duration-200 focus:ring-2 focus:ring-offset-2 ${field.color ? `accent-${field.color}` : ''} ${field.size === 'sm' ? 'h-4 w-4' : field.size === 'lg' ? 'h-6 w-6' : ''}`}
					aria-label={field.label}
					aria-describedby={field.helper ? `${field.db_fieldName}-helper` : undefined}
					style={field.color ? `accent-color: ${field.color}` : ''}
				/>
				<span>{field.label}</span>
			</label>
		</div>
		{#if field.helper}
			<div id={`${field.db_fieldName}-helper`} class="mt-2 text-xs text-gray-500">
				{field.helper}
			</div>
		{/if}
	</fieldset>
</div>
