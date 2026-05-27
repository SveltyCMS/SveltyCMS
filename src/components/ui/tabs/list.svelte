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
- WCAG 3.0 ready with `role="tablist"` and keyboard navigation (delegated to Trigger)
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
</script>

<div class={cn("tabs-list flex border-b border-surface-200 dark:border-surface-700 mb-4 overflow-x-auto scrollbar-hide", className)} role="tablist">
	{@render children?.()}
</div>

<style>
	.scrollbar-hide::-webkit-scrollbar { display: none; }
	.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
</style>
