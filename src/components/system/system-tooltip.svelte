<!--
@file src/components/system/SystemTooltip.svelte
@component
**SystemTooltip component**

This component provides a tooltip for any element.

@example
<SystemTooltip title="Tooltip">
	<Button variant="outline">Hover me</Button>
</SystemTooltip>

### Props
- `title` {string}: Tooltip title (default: '')
- `children` {import('svelte').Snippet}: Tooltip content (default: null)
- `positioning` {object}: Tooltip positioning (default: { placement: 'top', gutter: 10 })

### Features
- Provides a tooltip for any element
- Supports dynamic updates to tooltip content
- Allows customization of tooltip positioning
- Integrates with global search and filter states
- Optimized for performance with minimal re-renders
-->

<script lang="ts">
	interface Props {
		children?: import('svelte').Snippet;
		content?: import('svelte').Snippet;
		contentClass?: string;
		arrowClass?: string;
		positioning?: {
			placement?:
				| 'top'
				| 'top-start'
				| 'top-end'
				| 'bottom'
				| 'bottom-start'
				| 'bottom-end'
				| 'left'
				| 'left-start'
				| 'left-end'
				| 'right'
				| 'right-start'
				| 'right-end';
			gutter?: number;
		};
		title?: string;
		triggerClass?: string;
		triggerStyle?: string;
		wFull?: boolean;
		role?: string | null;
		tabindex?: number | string | null;
	}

	let {
		title = '',
		content: contentProp,
		contentClass = '',
		arrowClass = '',
		triggerClass = '',
		triggerStyle = '',
		wFull = false,
		children: childrenProp,
		positioning = { placement: 'top', gutter: 10 },
		role = 'button',
		tabindex = 0
	}: Props = $props();

	const TOOLTIP_CLASS = 'rounded bg-surface-900 dark:bg-white px-3 py-1.5 text-[11px] font-medium shadow-2xl text-white dark:text-surface-900 border border-white/10 dark:border-black/5';

	// Native UI Tooltip
	import Tooltip from "@components/ui/tooltip.svelte";

	const resolvedTriggerClass = $derived(`p-0 m-0 border-none ${!triggerClass ? 'bg-transparent' : ''} ${wFull ? 'block w-full' : 'inline-block'} ${triggerClass}`);
</script>

<Tooltip
	{title}
	{positioning}
	class={`${TOOLTIP_CLASS} ${contentClass}`}
	triggerClass={resolvedTriggerClass}
	{arrowClass}
	style={triggerStyle}
	{role}
	{tabindex}
>
	{#snippet children()}
		{@render childrenProp?.()}
	{/snippet}
	{#snippet content()}
		{#if contentProp}
			{@render contentProp()}
		{:else}
			{title}
		{/if}
	{/snippet}
</Tooltip>
