<!--
@file src/components/ui/popover.svelte
@component
**SveltyCMS Popover — WCAG 3.0 Ready**

Self-positioning popover using the `useFloating` rune (CSS Anchor Positioning
with JS fallback). Zero external positioning dependencies. Handles auto-flip,
viewport clamping, directional arrow, click-outside + Escape dismissal, and
focus restoration.

### Props
- `open` (boolean): Bindable open state.
- `position` (Placement): Preferred placement (default: 'bottom').
- `arrow` (boolean): Show directional arrow (default: true).
- `trigger` / `children` (Snippet): Trigger and content slots.
- `class` (string): Additional CSS classes.

### Features:
- CSS Anchor Positioning (compositor-level) in Chrome 143+ / Firefox 147+
- JS fallback with flip + shift for Safari and older browsers
- WCAG 3.0: aria-haspopup, aria-expanded, role="dialog", Escape close, focus restore
- click-outside dismissal
- directional arrow indicator
- full Svelte 5 runes: $props, $bindable, $derived, $state, $effect
-->

<script lang="ts">
	import { cn } from '@utils/cn';
	import { onMount } from 'svelte';
	import type { Snippet } from 'svelte';
	import Portal from './portal.svelte';
	import { useFloating, type Placement } from '@utils/use-floating.svelte.ts';

	interface Props {
		open?: boolean;
		position?: Placement;
		arrow?: boolean;
		class?: string;
		trigger?: Snippet;
		children?: Snippet;
		role?: string | null;
		tabindex?: number | string | null;
		[key: string]: any;
	}

	let {
		open = $bindable(false),
		position = 'bottom' as Placement,
		arrow = true,
		class: className,
		trigger,
		children,
		role = 'button',
		tabindex = 0,
		...rest
	}: Props = $props();

	let referenceEl = $state<HTMLElement | null>(null);
	let floatingEl = $state<HTMLElement | null>(null);
	let arrowEl = $state<HTMLElement | null>(null);
	let hasFocusableDescendant = $state(false);

	const floating = useFloating({
		reference: () => referenceEl,
		floating: () => floatingEl,
		arrow: () => arrowEl,
		placement: () => position,
		offset: 12,
		padding: 10,
		enabled: () => open,
		showArrow: () => arrow,
	});

	// Click outside + Escape dismissal with focus restoration
	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape' && open) {
			open = false;
			referenceEl?.focus();
		}
	}

	function handleClickOutside(event: MouseEvent) {
		if (
			open &&
			referenceEl &&
			floatingEl &&
			!referenceEl.contains(event.target as Node) &&
			!floatingEl.contains(event.target as Node)
		) {
			open = false;
		}
	}

	onMount(() => {
		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleKeydown);
		return () => {
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('keydown', handleKeydown);
		};
	});

	$effect(() => {
		if (referenceEl) {
			const focusable = referenceEl.querySelectorAll(
				'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
			);
			hasFocusableDescendant = focusable.length > 0;
			if (hasFocusableDescendant) {
				for (const el of focusable) {
					el.setAttribute('aria-haspopup', 'true');
					el.setAttribute('aria-expanded', String(open));
				}
			}
		}
	});

	const activeTabindex = $derived(hasFocusableDescendant ? undefined : (tabindex === null ? undefined : (typeof tabindex === 'string' ? parseInt(tabindex, 10) : tabindex)));
	const activeRole = $derived(hasFocusableDescendant ? undefined : (role === null ? undefined : role));

	function toggle() {
		open = !open;
		if (open) {
			requestAnimationFrame(() => floatingEl?.focus());
		} else {
			referenceEl?.focus();
		}
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
	bind:this={referenceEl}
	class="inline-block"
	onclick={(e) => { e.stopPropagation(); toggle(); }}
	onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle()}
	role={activeRole}
	tabindex={activeTabindex}
	{...floating.triggerAria}
	aria-haspopup={hasFocusableDescendant ? undefined : "true"}
	aria-expanded={hasFocusableDescendant ? undefined : open}
	{...rest}
>
	{#if trigger}
		{@render trigger()}
	{/if}
</div>

{#if open}
	<Portal>
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
		<div
			bind:this={floatingEl}
			class={cn(
				'z-200 card p-4 shadow-xl border border-surface-200 dark:border-surface-800 bg-surface-100/90 dark:bg-surface-900/90 backdrop-blur-md fixed',
				'transition-all duration-200 animate-in fade-in zoom-in-95',
				className
			)}
			style={floating.positionStyle}
			tabindex="-1"
			{...floating.contentAria}
		>
			{#if arrow}
				<div
					bind:this={arrowEl}
					class="absolute size-3 bg-surface-100 dark:bg-surface-900 border-s border-t border-surface-200 dark:border-surface-800 rotate-45"
					style="
						left: {floating.arrowX != null ? `${floating.arrowX}px` : ''};
						top: {floating.arrowY != null ? `${floating.arrowY}px` : ''};
						{floating.staticSide}: -6px;
					"
				></div>
			{/if}

			{#if children}
				{@render children()}
			{/if}
		</div>
	</Portal>
{/if}
