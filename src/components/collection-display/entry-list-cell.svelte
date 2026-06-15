<!--
@file src/components/collection-display/entry-list-cell.svelte
@component
**Read-only table cell using the widget Display pillar when available.**

Falls back to Sanitize/string rendering for system fields and legacy values.
-->

<script lang="ts">
	import Sanitize from '@src/utils/sanitize.svelte';
	import { widgets } from '@src/stores/widget-store.svelte';
	import { getCachedWidgetDisplayLoader } from '@widgets/widget-loader-registry';
	import { onMount } from 'svelte';

	interface Props {
		widgetName?: string;
		fieldName: string;
		value: unknown;
		contentLanguage: string;
		compact?: boolean;
	}

	let { widgetName, fieldName, value, contentLanguage, compact = true }: Props = $props();

	let DisplayComponent = $state<any>(null);
	let loadFailed = $state(false);

	const displayValue = $derived.by(() => {
		if (value === null || value === undefined) return '-';
		if (typeof value === 'object' && !Array.isArray(value)) {
			const record = value as Record<string, unknown>;
			const langVal = record[contentLanguage];
			if (langVal !== undefined && langVal !== null) return langVal;
			const first = Object.values(record)[0];
			return first ?? '-';
		}
		return value;
	});

	onMount(async () => {
		if (!widgetName) return;
		const loader = getCachedWidgetDisplayLoader(widgetName, widgets.widgetFunctions);
		if (!loader) {
			loadFailed = true;
			return;
		}
		try {
			const mod = await loader();
			DisplayComponent = mod.default;
		} catch {
			loadFailed = true;
		}
	});
</script>

{#if DisplayComponent && !loadFailed}
	{const Component = DisplayComponent}
	<Component
		field={{ db_fieldName: fieldName, label: fieldName, widget: { Name: widgetName } }}
		value={displayValue}
		{compact}
	/>
{:else if typeof displayValue === 'string' || typeof displayValue === 'number'}
	<Sanitize html={String(displayValue)} profile="strict" />
{:else}
	<Sanitize html={String(displayValue ?? '-')} profile="strict" />
{/if}