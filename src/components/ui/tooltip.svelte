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
		[key: string]: any;
	}

	let {
		title = "",
		positioning = { placement: "top", gutter: 8 },
		class: className,
		triggerClass,
		content,
		children,
		...rest
	}: Props = $props();

	let open = $state(false);
	let referenceEl = $state<HTMLElement | null>(null);
	let floatingEl = $state<HTMLElement | null>(null);
	let arrowEl = $state<HTMLElement | null>(null);

	const placement = $derived(positioning.placement ?? "top");
	const gutter = $derived(positioning.gutter ?? 8);

	const floating = useFloating({
		reference: () => referenceEl,
		floating: () => floatingEl,
		arrow: () => arrowEl,
		placement: () => placement,
		offset: () => gutter,
		padding: 5,
		enabled: () => open,
		showArrow: () => true,
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

<div
	bind:this={referenceEl}
	class={cn("inline-block", triggerClass)}
	onmouseenter={show}
	onmouseleave={hide}
	onfocus={show}
	onblur={hide}
	aria-describedby={open ? "tooltip-content" : undefined}
	tabindex="0"
	role="button"
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
			id="tooltip-content"
			role="tooltip"
			class={cn(
				"z-300 card px-2.5 py-1.5 text-xs font-medium shadow-xl fixed",
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

			<!-- Arrow -->
			<div
				bind:this={arrowEl}
				class="absolute size-2 bg-surface-900 dark:bg-white rotate-45"
				style="
					left: {floating.arrowX != null ? `${floating.arrowX}px` : ''};
					top: {floating.arrowY != null ? `${floating.arrowY}px` : ''};
					{floating.staticSide}: -4px;
				"
			></div>
		</div>
	</Portal>
{/if}
