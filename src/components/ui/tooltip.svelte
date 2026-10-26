<!--
@file src/components/ui/tooltip.svelte
@component
**SveltyCMS Tooltip — WCAG 3.0 Ready**

Self-positioning tooltip using the `useFloating` rune (CSS Anchor Positioning
with JS fallback). Shows on hover/focus, hides on leave/blur/Escape. Delayed
reveal after position calculation prevents layout flash.

### Props
- `title` (string): Tooltip text (used if no content snippet).
- `positioning` ({ placement, gutter }): Placement options (default: top, 8px).
- `triggerClass` (string): CSS class for the trigger wrapper.
- `class` (string): Additional CSS classes on the tooltip.
- `content` / `children` (Snippet): Custom tooltip/trigger content.

### Features:
- CSS Anchor Positioning (compositor-level) in Chrome 143+ / Firefox 147+
- JS fallback with flip + shift for Safari and older browsers
- show on mouseenter/focus, hide on mouseleave/blur/Escape
- delayed visibility until position calculated (opacity-0 trick)
- arrow anchor delegated to `useFloating` (resolved placement, flip/shift, resize-aware)
- portals into the enclosing modal `<dialog>` so it renders above the top layer
- WCAG 3.0: role="tooltip", aria-describedby trigger→content linkage
- full Svelte 5 runes: $props, $derived, $state, $effect
-->

<script lang="ts">
	import { cn } from '@utils/cn';
	import type { Snippet } from 'svelte';
	import Portal from './portal.svelte';
	import { useFloating, type Placement } from '@utils/use-floating.svelte.ts';

	interface Props {
		title?: string;
		positioning?: {
			placement?: Placement;
			gutter?: number;
		};
		class?: string;
		triggerClass?: string;
		content?: Snippet;
		children?: Snippet;
		role?: string | null;
		tabindex?: number | string | null;
		[key: string]: any;
	}

	let {
		title = '',
		positioning = { placement: 'top', gutter: 8 },
		class: className,
		triggerClass,
		content,
		children,
		role = 'button',
		tabindex = 0,
		...rest
	}: Props = $props();

	let open = $state(false);
	let referenceEl = $state<HTMLElement | null>(null);
	let floatingEl = $state<HTMLElement | null>(null);
	let arrowEl = $state<HTMLElement | null>(null);
	let hasFocusableDescendant = $state(false);
	const uid = $props.id();
	const tooltipId = `tooltip-${uid}`;

	const placement = $derived(positioning.placement ?? 'top');
	const gutter = $derived(positioning.gutter ?? 8);

	function resolveReference(): HTMLElement | null {
		if (!referenceEl) return null;
		const focusable = referenceEl.querySelector(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
		) as HTMLElement | null;
		return focusable ?? referenceEl;
	}

	const floating = useFloating({
		reference: resolveReference,
		floating: () => floatingEl,
		arrow: () => arrowEl,
		placement: () => placement,
		offset: () => gutter,
		padding: 5,
		enabled: () => open,
		showArrow: () => true,
		arrowSize: 14
	});

	$effect(() => {
		if (referenceEl) {
			const focusable = referenceEl.querySelectorAll(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			hasFocusableDescendant = focusable.length > 0;
			if (hasFocusableDescendant) {
				for (const el of focusable) {
					if (open) {
						el.setAttribute('aria-describedby', tooltipId);
					} else {
						el.removeAttribute('aria-describedby');
					}
				}
			}
		}
	});

	const activeTabindex = $derived(
		hasFocusableDescendant
			? undefined
			: tabindex === null
				? undefined
				: typeof tabindex === 'string'
					? parseInt(tabindex, 10)
					: tabindex
	);
	const activeRole = $derived(
		hasFocusableDescendant ? undefined : role === null ? undefined : role
	);

	// The arrow anchor comes from `useFloating` — the same rects it positions with,
	// after flip/shift, and updated on scroll/resize. Re-deriving it here from
	// `floating.x/y` went stale whenever the tooltip's size changed (arrow left
	// behind in the corner) and ignored the resolved placement.
	let borderInset = $state(0);
	$effect(() => {
		borderInset = floatingEl ? parseFloat(getComputedStyle(floatingEl).borderTopWidth) || 0 : 0;
	});

	/**
	 * Position the rotated diamond so its CENTRE sits on the border-box edge:
	 * `arrowX/arrowY` are the edge point in padding-box coordinates, plus the live
	 * border inset. Half the 14px square (size-3.5) keeps the base inside the body
	 * while the tip pokes out exactly 50/50.
	 */
	const arrowStyle = $derived.by(() => {
		if (floating.arrowX == null || floating.arrowY == null) return '';
		const half = 7 + borderInset;
		return `left: ${floating.arrowX - half}px; top: ${floating.arrowY - half}px;`;
	});

	// Only one tooltip may be open at a time: when the pointer moves onto any
	// element outside this trigger, close — otherwise focus/click-opened
	// tooltips linger next to neighbouring controls (setup header showed two
	// tooltips when moving from the theme toggle to the language/a11y buttons).
	$effect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			const target = e.target as Node | null;
			if (referenceEl && target && !referenceEl.contains(target)) hide();
		};
		document.addEventListener('mouseover', handler, { capture: true });
		return () => document.removeEventListener('mouseover', handler, { capture: true });
	});

	// A modal <dialog> (showModal) lives in the browser top layer, above any z-index.
	// Portal into the open dialog that contains the trigger so the tooltip joins that
	// layer instead of rendering behind the modal. The <dialog> has no transform, so
	// `position: fixed` inside it still resolves against the viewport.
	let portalTarget = $state<HTMLElement | string>('body');

	function show() {
		portalTarget = (referenceEl?.closest('dialog[open]') as HTMLElement | null) ?? 'body';
		open = true;
	}
	function hide() {
		open = false;
	}
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) hide();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={referenceEl}
	class={cn('inline-flex shrink-0', triggerClass)}
	onmouseenter={show}
	onmouseleave={hide}
	onfocusin={show}
	onfocusout={hide}
	aria-describedby={open && !hasFocusableDescendant ? tooltipId : undefined}
	tabindex={activeTabindex}
	role={activeRole}
	{...rest}
>
	{#if children}
		{@render children()}
	{/if}
</div>

{#if open}
	<Portal target={portalTarget}>
		<div
			bind:this={floatingEl}
			id={tooltipId}
			role="tooltip"
			class={cn(
				'z-300 pointer-events-none overflow-visible rounded-(--admin-radius-input) px-2.5 py-1.5 text-xs font-medium shadow-xl fixed',
				'bg-(--admin-bg-tooltip) text-(--admin-text-tooltip)',
				'transition-opacity duration-150',
				!floating.positionCalculated ? 'opacity-0' : 'opacity-100',
				className
			)}
			style={floating.positionStyle}
		>
			{#if content}
				{@render content()}
			{:else}
				<span>{title}</span>
			{/if}

			<div
				bind:this={arrowEl}
				class={cn('pointer-events-none absolute size-3.5 bg-inherit rotate-45')}
				style={arrowStyle}
			></div>
		</div>
	</Portal>
{/if}
