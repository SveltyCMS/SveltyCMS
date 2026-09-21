<script lang="ts">
	import type { ComponentRenderProps } from 'json-render-svelte';

	let props: ComponentRenderProps = $props();
	let element = $derived(props.element);

	const elementProps = $derived((element?.props as Record<string, unknown>) || {});
	const content = $derived(elementProps.content as string);
	const label = $derived(elementProps.label as string);
	const value = $derived(elementProps.value as string);
	const displayValue = $derived(content || value || '');
</script>

<div class="p-2">
	{#if label}
		<h4 class="text-sm font-bold text-surface-500 uppercase tracking-wider mb-1">{label}</h4>
	{/if}
	<p class="text-base text-surface-900 dark:text-surface-100">{displayValue}</p>
</div>
