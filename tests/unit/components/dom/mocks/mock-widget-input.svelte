<!--
@file tests/unit/components/dom/mocks/mock-widget-input.svelte
@component MockWidgetInput
@description Test double for widget input components in DOM interaction tests.
Features:
- Binds to value and triggers onFieldSync
- Renders checkbox or text input based on widget Name
-->
<script lang="ts">
	interface Props {
		value?: any;
		field: {
			db_fieldName: string;
			widget?: { Name?: string };
		};
		onFieldSync?: () => void;
	}

	let { value = $bindable(), field, onFieldSync }: Props = $props();
</script>

{#if field.widget?.Name === 'Checkbox'}
	<input
		type="checkbox"
		data-testid="checkbox-{field.db_fieldName}"
		checked={Boolean(value)}
		onchange={(e) => {
			value = (e.currentTarget as HTMLInputElement).checked;
			onFieldSync?.();
		}}
	/>
{:else}
	<input
		type="text"
		data-testid="input-{field.db_fieldName}"
		value={value ?? ''}
		oninput={(e) => {
			value = (e.currentTarget as HTMLInputElement).value;
			onFieldSync?.();
		}}
	/>
{/if}
