<!--
@file src/components/ui/tabs/content.svelte
@component
**SveltyCMS Tabs Content Panel — WCAG 3.0 Ready**

Conditionally rendered tab panel with `role="tabpanel"`. Only renders when
its value matches the active tab context.

### Props
- `value` (any): Tab value to match against active context.
- `children` (Snippet): Panel content.
- `class` (string): Additional CSS classes.

### Features:
- WCAG 3.0 ready with `role="tabpanel"` and conditional rendering
- receives active state from Tabs context via getContext
- full Svelte 5 runes: $props, getContext, $derived
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import { cn } from '@utils/cn';
	import type { Snippet } from 'svelte';

	interface TabsContext {
		value: any;
	}

	interface Props {
		value: any;
		children?: Snippet;
		class?: string;
	}

	let { value: contentValue, children, class: className = '' }: Props = $props();

	const context = getContext<TabsContext>('TABS_CONTEXT');
	const active = $derived(context?.value === contentValue);
</script>

{#if active}
	<div class={cn("tabs-content", className)} role="tabpanel">
		{@render children?.()}
	</div>
{/if}
