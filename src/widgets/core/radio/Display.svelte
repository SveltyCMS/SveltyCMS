<!--
@file src/widgets/core/radio/Display.svelte
@component
**Radio Widget Display Component**

Displays the selected radio option label by resolving the stored value against field options.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<RadioDisplay field={fieldDefinition} value="option-2" />
Renders: "Option Two" (looks up label from field.options)

### Props
- `field: FieldType` - Widget field definition with options array
- `value: string | number | null | undefined` - Selected option value

### Features
- **Label Resolution**: Maps stored values to human-readable option labels
- **Fallback Display**: Shows raw value if option not found in configuration
- **Null Handling**: Graceful fallback to "–" for empty selections
- **Type Flexibility**: Supports both string and numeric option values
- **Performance Optimized**: Efficient option lookup with `$derived.by()`
- **Configuration Driven**: Uses field.options array for label mapping
-->

<script lang="ts">
	import type { FieldType } from './';

	let { field, value }: { field: FieldType; value: string | number | null | undefined } = $props();

	// Find the label that corresponds to the stored value.
	const displayLabel = $derived.by(() => {
		if (value === null || value === undefined) return '–';
		const selectedOption = field.options?.find((opt) => opt.value === value);
		return selectedOption?.label || String(value); // Fallback to showing the raw value
	});
</script>

<span>{displayLabel}</span>
