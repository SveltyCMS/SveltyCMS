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
		arrowClass?: string;
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
		arrowClass,
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

	const arrowBorderClass = $derived.by(() => {
		const color = arrowClass ?? 'border-s-surface-900 dark:border-s-white';
		switch (floating.staticSide) {
			case 'left':
				return `border-y-transparent border-e-[6px] ${color.replace('border-s-', 'border-e-')}`;
			case 'bottom':
				return `border-x-transparent border-t-[6px] ${color.replace('border-s-', 'border-t-')}`;
			case 'top':
				return `border-x-transparent border-b-[6px] ${color.replace('border-s-', 'border-b-')}`;
			default:
				return `border-y-transparent border-s-[6px] ${color}`;
		}
	});

	const arrowStyle = $derived.by(() => {
		if (floating.arrowY == null && floating.arrowX == null) return '';
		const side = floating.staticSide;
		if (side === 'right' || side === 'left') {
			return `top: ${floating.arrowY}px; ${side}: -6px; transform: translateY(-50%);`;
		}
		return `left: ${floating.arrowX}px; ${side}: -6px; transform: translateX(-50%);`;
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
				"transition duration-150 animate-in fade-in zoom-in-95 scale-95",
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
					'pointer-events-none absolute h-0 w-0 border-y-[6px] border-y-transparent border-s-[6px]',
					arrowBorderClass,
				)}
				style={arrowStyle}
			></div>
		</div>
	</Portal>
{/if}
