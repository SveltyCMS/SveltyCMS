<!--
@file src/components/ui/tabs/list.svelte
@component
**SveltyCMS Tabs List — WCAG 3.0 Ready**

Horizontal scrollable tab list container with `role="tablist"` and hidden
scrollbar for clean overflow handling.

### Props
- `children` (Snippet): Tab Trigger children.
- `class` (string): Additional CSS classes.

### Features:
- WCAG 3.0 ready with `role="tablist"` and keyboard navigation (Arrow / Home / End, roving tabindex)
- horizontal scroll with hidden scrollbar for narrow containers
- full Svelte 5 runes: $props
-->
<script lang="ts">
	import { cn } from '@utils/cn';
	import type { Snippet } from 'svelte';

	interface Props {
		children?: Snippet;
		class?: string;
	}

	let { children, class: className = '' }: Props = $props();

	/**
	 * Roving-tabindex keyboard navigation — the same contract as the array-driven
	 * `ui/tabs.svelte` (the /user reference). Inactive triggers carry `tabindex="-1"`,
	 * so without this handler a keyboard user could never leave the active tab.
	 */
	function handleKeyDown(event: KeyboardEvent) {
		if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
		const tabs = Array.from(
			(event.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('[role="tab"]')
		);
		// A click on the strip's padding focuses the tablist itself (`tabindex="-1"`);
		// fall back to the selected tab so the arrow keys keep working from there.
		const focused = tabs.indexOf(document.activeElement as HTMLElement);
		const current =
			focused === -1
				? tabs.findIndex((tab) => tab.getAttribute('aria-selected') === 'true')
				: focused;
		if (current === -1) return;
		event.preventDefault();
		const next =
			event.key === 'Home'
				? 0
				: event.key === 'End'
					? tabs.length - 1
					: event.key === 'ArrowRight'
						? (current + 1) % tabs.length
						: (current - 1 + tabs.length) % tabs.length;
		tabs[next]?.focus();
		tabs[next]?.click();
	}
</script>

<div
	class={cn(
		// Same tab strip as the array-driven `ui/tabs.svelte` (the /user reference):
		// flat row of underline tabs, no full-width divider — pages that want a
		// separator pass their own border via `class`.
		'flex gap-1 mb-4 overflow-x-auto scrollbar-hide',
		className
	)}
	role="tablist"
	tabindex="-1"
	onkeydown={handleKeyDown}
>
	{@render children?.()}
</div>

<style>
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>
