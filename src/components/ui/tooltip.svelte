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
- WCAG 3.0: role="tooltip", aria-describedby trigger→content linkage
- full Svelte 5 runes: $props, $derived, $state, $effect
-->

<script lang="ts">
	import { cn } from "@utils/cn";
	import type { Snippet } from "svelte";
	import Portal from "./portal.svelte";
	import { useFloating, type Placement } from "@utils/use-floating.svelte.ts";

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
		title = "",
		positioning = { placement: "top", gutter: 8 },
		class: className,
		triggerClass,
		content,
		children,
		role = "button",
		tabindex = 0,
		...rest
	}: Props = $props();

	let open = $state(false);
	let referenceEl = $state<HTMLElement | null>(null);
	let floatingEl = $state<HTMLElement | null>(null);
	let arrowEl = $state<HTMLElement | null>(null);
	let hasFocusableDescendant = $state(false);
	const tooltipId = `tooltip-${crypto.randomUUID().slice(0, 8)}`;

	const placement = $derived(positioning.placement ?? "top");
	const gutter = $derived(positioning.gutter ?? 8);

	function resolveReference(): HTMLElement | null {
		if (!referenceEl) return null;
		const focusable = referenceEl.querySelector(
			'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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
	});

	$effect(() => {
		if (referenceEl) {
			const focusable = referenceEl.querySelectorAll(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
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

	const activeTabindex = $derived(hasFocusableDescendant ? undefined : (tabindex === null ? undefined : (typeof tabindex === 'string' ? parseInt(tabindex, 10) : tabindex)));
	const activeRole = $derived(hasFocusableDescendant ? undefined : (role === null ? undefined : role));

	/**
	 * Calculate arrow position relative to the tooltip's target top-left.
	 * Uses floating.x/y (target coordinates from useFloating) so the
	 * calculation is correct even before the DOM paints.
	 */
	let arrowX = $state<number | null>(null);
	let arrowY = $state<number | null>(null);
	let arrowSide = $state<string>('bottom');

	$effect(() => {
		if (!open || !referenceEl || !floatingEl) {
			arrowX = null;
			arrowY = null;
			return;
		}

		if (!floating.positionCalculated) {
			arrowX = null;
			arrowY = null;
			return;
		}

		const ref = resolveReference();
		if (!ref) {
			arrowX = null;
			arrowY = null;
			return;
		}

		const refRect = ref.getBoundingClientRect();
		const floatRect = floatingEl.getBoundingClientRect();
		const [side] = (floating.placement || 'top').split('-');

		// Center of the reference element
		const targetX = refRect.left + refRect.width / 2;
		const targetY = refRect.top + refRect.height / 2;

		// Arrow position relative to tooltip's target top-left
		let ax: number, ay: number;
		if (side === 'top' || side === 'bottom') {
			ax = targetX - floating.x;
			ay = side === 'top' ? floatRect.height : 0;
		} else {
			ax = side === 'left' ? floatRect.width : 0;
			ay = targetY - floating.y;
		}

		ax = Math.max(9, Math.min(Math.round(ax), floatRect.width - 9));
		ay = Math.max(9, Math.min(Math.round(ay), floatRect.height - 9));

		arrowX = ax;
		arrowY = ay;
		arrowSide = floating.staticSide;
	});

	const arrowStyle = $derived.by(() => {
		if (arrowY == null && arrowX == null) return '';
		return `left: ${arrowX}px; top: ${arrowY}px; ${arrowSide}: -3px;`;
	});

	function show() {
		open = true;
	}
	function hide() {
		open = false;
	}
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === "Escape" && open) hide();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={referenceEl}
	class={cn("inline-flex shrink-0", triggerClass)}
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
	<Portal>
		<div
			bind:this={floatingEl}
			id={tooltipId}
			role="tooltip"
			class={cn(
				"z-300 pointer-events-none overflow-visible rounded px-2.5 py-1.5 text-xs font-medium shadow-xl fixed",
				"bg-surface-900 dark:bg-white text-white dark:text-surface-900",
				"transition-opacity duration-150",
				!floating.positionCalculated ? "opacity-0" : "opacity-100",
				className,
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
				class={cn(
					'pointer-events-none absolute size-3 bg-surface-900 dark:bg-white rotate-45',
				)}
				style={arrowStyle}
			></div>
		</div>
	</Portal>
{/if}
