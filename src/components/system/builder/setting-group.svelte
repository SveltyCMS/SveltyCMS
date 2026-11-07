<!--
@file src/components/system/builder/setting-group.svelte
@component
@description Recursive renderer for `group` entries in a widget GuiSchema.

Features:
- Renders nested GuiSchema fields with the same controls as the Settings tab
- Rebinds the whole group value so the parent editor form stays in sync
- Supports nested groups (a group field may itself use `widget: "group"`)
-->

<script lang="ts">
	import type { Component } from 'svelte';

	interface GuiEntry {
		widget?: string;
		label?: string;
		fields?: Record<string, GuiEntry>;
		[key: string]: unknown;
	}

	interface Props {
		value?: Record<string, unknown> | null;
		fields?: Record<string, GuiEntry>;
		label?: string;
		labelClass?: string;
		/**
		 * Recursive renderer injected by `input-switch.svelte` (a `group` entry
		 * renders its own fields). Typed as a loose component because InputSwitch
		 * forwards a rest-props bag; importing the concrete component type would
		 * recreate the runtime cycle this split removed.
		 */
		itemComponent?: Component<Record<string, unknown>>;
	}

	let { value = $bindable({}), fields = {}, label, labelClass, itemComponent }: Props = $props();

	const entries = $derived(Object.entries(fields));

	function update(key: string, next: unknown) {
		value = { ...value, [key]: next };
	}
</script>

<fieldset
	class="flex flex-col gap-3 rounded-(--admin-radius-card) border border-(--admin-border-default) p-3"
>
	{#if label}
		<legend class={labelClass ?? 'text-sm font-semibold text-(--admin-text-body)'}>{label}</legend>
	{/if}
	<div class="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
		{#if itemComponent}
			{@const ItemComponent = itemComponent}
			{#each entries as [key, schema] (key)}
				<ItemComponent
					value={value?.[key]}
					widget={schema.widget}
					{key}
					{schema}
					label={schema.label ?? key}
					onupdate={(e: { value: unknown }) => update(key, e.value)}
				/>
			{/each}
		{/if}
	</div>
</fieldset>
