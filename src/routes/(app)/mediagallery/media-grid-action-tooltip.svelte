<!--
@file src/routes/(app)/mediagallery/media-grid-action-tooltip.svelte
@component
**Hover tooltip for media grid action buttons**

Positions from the actual trigger button via fixed coordinates — avoids shared
floating/anchor bugs when multiple icons stack in a column.

### Props
- `title` (string): Simple label tooltip
- `content` (Snippet): Rich tooltip body (overrides title)
- `children` (Snippet): Button inner content
- `theme` ('dark' | 'light'): Panel + arrow colors
-->

<script lang="ts">
	import Portal from '@components/ui/portal.svelte';
	import { cn } from '@utils/cn';
	import type { Snippet } from 'svelte';

	interface Props {
		ariaLabel: string;
		children: Snippet;
		class?: string;
		content?: Snippet;
		contentClass?: string;
		gutter?: number;
		onclick?: (e: MouseEvent) => void;
		theme?: 'dark' | 'light';
		title?: string;
		'data-testid'?: string;
	}

	let {
		ariaLabel,
		children,
		class: className = '',
		content,
		contentClass = '',
		gutter = 10,
		onclick,
		theme = 'dark',
		title = '',
		'data-testid': dataTestId
	}: Props = $props();

	let open = $state(false);
	let triggerEl = $state<HTMLButtonElement | null>(null);
	let panelEl = $state<HTMLElement | null>(null);
	let panelLeft = $state(0);
	let panelTop = $state(0);
	let arrowTop = $state(0);
	let panelSide = $state<'left' | 'right'>('left');
	let positioned = $state(false);

	function reposition(): void {
		if (!triggerEl || !panelEl) return;
		const trigger = triggerEl.getBoundingClientRect();
		const panel = panelEl.getBoundingClientRect();
		const edge = 8;

		// Open on the side with room: inline-start first, then flip to the other side
		// near the tile/viewport edge. The arrow follows the chosen side so it always
		// points back at the trigger.
		const spaceLeft = trigger.left - gutter - edge;
		const spaceRight = window.innerWidth - trigger.right - gutter - edge;
		const openRight = spaceLeft < panel.width && spaceRight >= panel.width;
		panelSide = openRight ? 'right' : 'left';
		panelLeft = openRight
			? Math.min(trigger.right + gutter, window.innerWidth - panel.width - edge)
			: Math.max(edge, trigger.left - panel.width - gutter);
		panelTop = Math.max(
			edge,
			Math.min(
				trigger.top + trigger.height / 2 - panel.height / 2,
				window.innerHeight - panel.height - edge
			)
		);
		arrowTop = Math.max(
			12,
			Math.min(trigger.top + trigger.height / 2 - panelTop, panel.height - 12)
		);
		positioned = true;
	}

	function show(): void {
		open = true;
		positioned = false;
	}

	function hide(): void {
		open = false;
		positioned = false;
	}

	$effect(() => {
		if (!open || !triggerEl || !panelEl) return;

		const run = () => reposition();
		const raf = requestAnimationFrame(() => requestAnimationFrame(run));

		const onMove = () => reposition();
		window.addEventListener('scroll', onMove, true);
		window.addEventListener('resize', onMove);

		const observer = new ResizeObserver(run);
		observer.observe(panelEl);

		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('scroll', onMove, true);
			window.removeEventListener('resize', onMove);
			observer.disconnect();
		};
	});

	const panelClass = $derived(
		theme === 'light'
			? 'min-w-[10.5rem] rounded-(--admin-radius-input) border border-(--admin-border-default) bg-(--admin-bg-card) px-3 py-2.5 text-(--admin-text-body) shadow-lg'
			: 'rounded-(--admin-radius-input) bg-surface-900 px-3 py-1.5 text-[11px] font-medium text-white shadow-2xl'
	);

	const arrowStyle = $derived(
		`top:${arrowTop}px;transform:translateY(-50%);${
			panelSide === 'left'
				? `right:-6px;border-left:6px solid ${theme === 'light' ? 'var(--admin-bg-card)' : 'var(--color-surface-900)'};`
				: `left:-6px;border-right:6px solid ${theme === 'light' ? 'var(--admin-bg-card)' : 'var(--color-surface-900)'};`
		}`
	);
</script>

<!-- DOM node, not Button: the tooltip measures triggerEl.getBoundingClientRect(). -->
<button
	bind:this={triggerEl}
	type="button"
	aria-label={ariaLabel}
	class={className}
	data-testid={dataTestId}
	onclick={(e) => onclick?.(e)}
	onmouseenter={show}
	onmouseleave={hide}
	onfocus={show}
	onblur={hide}
>
	{@render children()}
</button>

{#if open}
	<Portal>
		<div
			bind:this={panelEl}
			role="tooltip"
			class={cn(
				'pointer-events-none fixed z-300',
				panelClass,
				contentClass,
				!positioned && 'opacity-0'
			)}
			style:left="{panelLeft}px"
			style:top="{panelTop}px"
		>
			{#if content}
				{@render content()}
			{:else}
				{title}
			{/if}
			<div
				class="pointer-events-none absolute h-0 w-0 border-y-[6px] border-y-transparent"
				style={arrowStyle}
				aria-hidden="true"
			></div>
		</div>
	</Portal>
{/if}
