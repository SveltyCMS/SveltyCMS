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
		triggerClass = '',
		triggerStyle = '',
		wFull = false,
		children: childrenProp,
		positioning = { placement: 'top', gutter: 10 },
		role = 'button',
		tabindex = 0
	}: Props = $props();

	const TOOLTIP_CLASS =
		'w-max max-w-[270px] sm:max-w-[300px] rounded-xl bg-surface-900/95 dark:bg-surface-800/95 px-3.5 py-2.5 text-[11px] font-medium leading-snug tracking-normal shadow-2xl text-white dark:text-surface-100 border border-surface-700/80 dark:border-surface-600/80 backdrop-blur-md';

	// Native UI Tooltip
	import Tooltip from "@components/ui/tooltip.svelte";

	const resolvedTriggerClass = $derived(`p-0 m-0 border-none ${!triggerClass ? 'bg-transparent' : ''} ${wFull ? 'block w-full' : 'inline-block'} ${triggerClass}`);
</script>

	<Tooltip
		{title}
		{positioning}
		class={`${TOOLTIP_CLASS} ${contentClass}`}
		triggerClass={resolvedTriggerClass}
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
