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

	let { value: triggerValue, disabled = false, children, class: className = '', ...rest }: Props = $props();

	const context = getContext<TabsContext>('TABS_CONTEXT');
	const active = $derived(context?.value === triggerValue);

	function handleClick() {
		if (disabled) return;
		context?.setTab(triggerValue);
	}
</script>

<button
	type="button"
	role="tab"
	aria-selected={active}
	tabindex={active ? 0 : -1}
	{disabled}
	{...rest}
	class={cn(
		'relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium leading-snug transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tertiary-500/30 dark:focus-visible:ring-primary-500/30 border-b-2 -mb-px whitespace-nowrap',
		active
			? 'border-tertiary-500 dark:border-primary-500 text-tertiary-500 dark:text-primary-500'
			: 'border-transparent text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100',
		disabled && 'opacity-50 cursor-not-allowed',
		className
	)}
	onclick={handleClick}
>
	{@render children?.()}
</button>
