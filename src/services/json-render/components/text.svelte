<!--
@file src/services/json-render/components/text.svelte
@component
@description Text and fallback Control renderer for AI-generated dashboard specs.
### Features
- Supports both `element.props` and JSON-Forms-style `element.label` / `element.options`
-->
<script lang="ts">
	import type { ComponentRenderProps } from '../catalog';

	let props: ComponentRenderProps = $props();
	let element = $derived(props.element);

	const elementProps = $derived(
		(element?.props ?? element?.options ?? {}) as Record<string, unknown>
	);
	const content = $derived((elementProps.content as string) || '');
	const label = $derived((elementProps.label as string) || element?.label || '');
	const value = $derived((elementProps.value as string) || '');
	const displayValue = $derived(content || value || '');
</script>

<div class="p-2">
	{#if label}
		<h4 class="text-sm font-bold text-surface-500 uppercase tracking-wider mb-1">{label}</h4>
	{/if}
	<p class="text-base text-surface-900 dark:text-surface-100">{displayValue}</p>
</div>
