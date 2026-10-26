<!--
@file src/components/ui/tabs/trigger.svelte
@component
**SveltyCMS Tabs Trigger — WCAG 3.0 Ready**

Individual tab button with `role="tab"`, `aria-selected`, roving tabindex,
and active border indicator. Receives context from parent Tabs component.

### Props
- `value` (any): Tab value to activate when clicked.
- `disabled` (boolean): Disable this tab.
- `class` (string): Additional CSS classes.
- `children` (Snippet): Tab label/content.
- `[key: string]: any`: Pass-through HTML attributes (e.g., `aria-current`).

### Features:
- WCAG 3.0 ready with `role="tab"`, `aria-selected`, roving tabindex
- active state via the shared underline chrome (`./chrome.ts`): brand accent
  (tertiary light / primary dark) on a transparent 2 px bottom border
- pass-through attributes via `{...rest}` spread
- full Svelte 5 runes: $props, getContext, $derived
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import Button from '../button.svelte';
	import { cn } from '@utils/cn';
	import type { Snippet } from 'svelte';
	import { tabTrigger } from './chrome';

	interface TabsContext {
		value: any;
		setTab: (val: any) => void;
	}

	interface Props {
		value: any;
		disabled?: boolean;
		children?: Snippet;
		class?: string;
		[key: string]: any;
	}

	let {
		value: triggerValue,
		disabled = false,
		children,
		class: className = '',
		...rest
	}: Props = $props();

	const context = getContext<TabsContext>('TABS_CONTEXT');
	const active = $derived(context?.value === triggerValue);

	function handleClick() {
		if (disabled) return;
		context?.setTab(triggerValue);
	}
</script>

<Button
	variant="ghost"
	role="tab"
	data-value={triggerValue}
	aria-selected={active}
	tabindex={active ? 0 : -1}
	{disabled}
	{...rest}
	class={cn(tabTrigger(active), disabled && 'opacity-50 cursor-not-allowed', className)}
	onclick={handleClick}
>
	{@render children?.()}
</Button>
