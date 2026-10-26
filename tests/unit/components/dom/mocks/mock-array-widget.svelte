<!--
@file tests/unit/components/dom/mocks/mock-array-widget.svelte
@component MockArrayWidget
@description Test double for widgets whose `value` prop declares a fallback.

`value = $bindable([])` is the shape that throws `props_invalid_value` when the
parent binds `undefined` — the exact failure mode behind the create-mode 500.
-->

<script lang="ts">
	interface Props {
		value?: string[];
		field: { db_fieldName: string };
		onFieldSync?: () => void;
	}

	let { value = $bindable([]), field }: Props = $props();
</script>

<input
	data-testid="array-widget-{field.db_fieldName}"
	value={Array.isArray(value) ? value.join(',') : ''}
	readonly
/>
