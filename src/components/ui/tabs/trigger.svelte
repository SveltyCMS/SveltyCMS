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
- active state via primary-500 border-bottom + text color
- pass-through attributes via `{...rest}` spread
- full Svelte 5 runes: $props, getContext, $derived
-->
<script lang="ts">
	import { getContext } from 'svelte';
	import Button from '../button.svelte';
	import { cn } from '@utils/cn';
	import type { Snippet } from 'svelte';

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
	aria-selected={active}
	tabindex={active ? 0 : -1}
	{disabled}
	{...rest}
	class={cn(
		'flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-all duration-200 rounded-none! border-b-2',
		active
			? 'border-primary-500 text-primary-600 dark:text-primary-500'
			: 'border-transparent text-surface-500 hover:text-surface-600 dark:hover:text-surface-400 hover:border-surface-500/30',
		disabled && 'opacity-50 cursor-not-allowed',
		className
	)}
	onclick={handleClick}
>
	{@render children?.()}
</Button>
