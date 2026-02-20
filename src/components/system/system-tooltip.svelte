<!-- 
@file src/components/system/SystemTooltip.svelte
@component
**SystemTooltip component**

This component provides a tooltip for any element.

@example
<SystemTooltip title="Tooltip">
	<button>Hover me</button>
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
	}

	let {
		title = '',
		content,
		contentClass = '',
		triggerClass = '',
		triggerStyle = '',
		wFull = false,
		children,
		positioning = { placement: 'top', gutter: 10 }
	}: Props = $props();

	const TOOLTIP_CLASS = 'card rounded-md bg-surface-900 dark:bg-white p-2 text-xs shadow-xl text-white dark:text-surface-900';
	const ARROW_CLASS = '[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-900)] dark:[--arrow-background:var(--color-white)]';

	// Skeleton V4
	import { Tooltip, Portal } from '@skeletonlabs/skeleton-svelte';
</script>

<Tooltip {positioning}>
	<Tooltip.Trigger
		class={`p-0 m-0 border-none ${triggerClass ? '' : 'bg-transparent'} ${wFull ? 'block w-full' : 'inline-block'} ${triggerClass}`}
		style={triggerStyle}
	>
		{@render children?.()}
	</Tooltip.Trigger>
	<Portal>
		<Tooltip.Positioner>
			<Tooltip.Content class={`${TOOLTIP_CLASS} ${contentClass}`}>
				{#if content}
					{@render content()}
				{:else}
					<span>{title}</span>
				{/if}
				<Tooltip.Arrow class={ARROW_CLASS}><Tooltip.ArrowTip /></Tooltip.Arrow>
			</Tooltip.Content>
		</Tooltip.Positioner>
	</Portal>
</Tooltip>
