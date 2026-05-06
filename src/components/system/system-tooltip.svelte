<!-- 
@file src/components/system/SystemTooltip.svelte
@component
**SystemTooltip component**

This component provides a tooltip for any element.
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

	const tooltipId = `system-tooltip-${Math.random().toString(36).slice(2)}`;
	const TOOLTIP_CLASS = 'card rounded-md bg-surface-900 dark:bg-white p-2 text-xs shadow-xl text-white dark:text-surface-900';

	const placement = $derived(positioning.placement ?? 'top');
	const gutter = $derived(positioning.gutter ?? 10);

	const tooltipStyle = $derived(getTooltipStyle(placement, gutter));
	const arrowClass = $derived(getArrowClass(placement));
	const arrowStyle = $derived(getArrowStyle(placement));

	function getTooltipStyle(currentPlacement: NonNullable<Props['positioning']>['placement'], currentGutter: number) {
		switch (currentPlacement) {
			case 'top-start':
				return `bottom: calc(100% + ${currentGutter}px); left: 0;`;
			case 'top-end':
				return `bottom: calc(100% + ${currentGutter}px); right: 0;`;
			case 'bottom':
				return `top: calc(100% + ${currentGutter}px); left: 50%; transform: translateX(-50%);`;
			case 'bottom-start':
				return `top: calc(100% + ${currentGutter}px); left: 0;`;
			case 'bottom-end':
				return `top: calc(100% + ${currentGutter}px); right: 0;`;
			case 'left':
				return `right: calc(100% + ${currentGutter}px); top: 50%; transform: translateY(-50%);`;
			case 'left-start':
				return `right: calc(100% + ${currentGutter}px); top: 0;`;
			case 'left-end':
				return `right: calc(100% + ${currentGutter}px); bottom: 0;`;
			case 'right':
				return `left: calc(100% + ${currentGutter}px); top: 50%; transform: translateY(-50%);`;
			case 'right-start':
				return `left: calc(100% + ${currentGutter}px); top: 0;`;
			case 'right-end':
				return `left: calc(100% + ${currentGutter}px); bottom: 0;`;
			case 'top':
			default:
				return `bottom: calc(100% + ${currentGutter}px); left: 50%; transform: translateX(-50%);`;
		}
	}

	function getArrowClass(currentPlacement: NonNullable<Props['positioning']>['placement']) {
		if (currentPlacement?.startsWith('bottom')) return 'bottom-arrow';
		if (currentPlacement?.startsWith('left')) return 'left-arrow';
		if (currentPlacement?.startsWith('right')) return 'right-arrow';
		return 'top-arrow';
	}

	function getArrowStyle(currentPlacement: NonNullable<Props['positioning']>['placement']) {
		if (currentPlacement === 'top-start' || currentPlacement === 'bottom-start') return 'left: 0.75rem;';
		if (currentPlacement === 'top-end' || currentPlacement === 'bottom-end') return 'right: 0.75rem;';
		if (currentPlacement === 'left-start' || currentPlacement === 'right-start') return 'top: 0.75rem;';
		if (currentPlacement === 'left-end' || currentPlacement === 'right-end') return 'bottom: 0.75rem;';
		return '';
	}
</script>

<span
	class={`system-tooltip-trigger p-0 m-0 border-none ${triggerClass ? '' : 'bg-transparent'} ${wFull ? 'block w-full' : 'inline-block'} ${triggerClass}`}
	style={triggerStyle}
	aria-describedby={tooltipId}
>
	{@render children?.()}

	<span id={tooltipId} role="tooltip" class={`system-tooltip-content ${TOOLTIP_CLASS} ${contentClass}`} style={tooltipStyle}>
		{#if content}
			{@render content()}
		{:else}
			<span>{title}</span>
		{/if}

		<span class={`system-tooltip-arrow ${arrowClass}`} style={arrowStyle}></span>
	</span>
</span>

<style>
	.system-tooltip-trigger {
		position: relative;
		vertical-align: inherit;
	}

	.system-tooltip-content {
		position: absolute;
		z-index: 9999;
		width: max-content;
		max-width: min(18rem, calc(100vw - 2rem));
		pointer-events: none;
		opacity: 0;
		visibility: hidden;
		transition:
			opacity 150ms ease,
			visibility 150ms ease;
	}

	.system-tooltip-trigger:hover > .system-tooltip-content,
	.system-tooltip-trigger:focus-within > .system-tooltip-content {
		opacity: 1;
		visibility: visible;
	}

	.system-tooltip-arrow {
		position: absolute;
		width: 0.5rem;
		height: 0.5rem;
		background: var(--color-surface-900);
		transform: rotate(45deg);
	}

	:global(.dark) .system-tooltip-arrow {
		background: var(--color-white);
	}

	.top-arrow {
		bottom: -0.25rem;
		left: 50%;
		margin-left: -0.25rem;
	}

	.bottom-arrow {
		top: -0.25rem;
		left: 50%;
		margin-left: -0.25rem;
	}

	.left-arrow {
		right: -0.25rem;
		top: 50%;
		margin-top: -0.25rem;
	}

	.right-arrow {
		left: -0.25rem;
		top: 50%;
		margin-top: -0.25rem;
	}
</style>