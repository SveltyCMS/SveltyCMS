<!--
@file src/widgets/core/select/display.svelte
@component
**Select Widget Display Component**
-->

<script lang="ts">
	import type { SelectOption, SelectProps } from './types';

	const {
		field,
		value
	}: {
		field: any & SelectProps;
		value: string | number | null | undefined;
	} = $props();

	// Find the label that corresponds to the stored value.
	const displayLabel = $derived.by(() => {
		if (value === null || value === undefined || value === '') {
			return '–';
		}

		const options = field.options || [];
		const selectedOption = options.find((opt: string | SelectOption) => {
			if (typeof opt === 'string') return opt === value;
			return opt.value === value;
		});

		if (selectedOption) {
			return typeof selectedOption === 'string' ? selectedOption : selectedOption.label;
		}

		return String(value); // Fallback to showing the raw value
	});
</script>

<span>{displayLabel}</span>
