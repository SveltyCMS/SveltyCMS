<!--
@file src/components/ui/tabs/tabs.svelte
@component
**SveltyCMS Tabs — WCAG 3.0 Ready**

Compound tab container providing Svelte context (value + setTab) to child
Trigger and Content components. Supports fluid width and onValueChange callback.

### Props
- `value` (any): Bindable active tab value.
- `onValueChange` (function): Callback with `{ value }` on tab change.
- `fluid` (boolean): Stretch to full container width.
- `class` (string): Additional CSS classes.
- `children` (Snippet): Tab List, Trigger, and Content children.

### Features:
- WCAG 3.0 ready with context-based tab state management
- compound component pattern (Tabs + Tabs.List + Tabs.Trigger + Tabs.Content)
- full Svelte 5 runes: $props, $bindable, setContext
-->
<script lang="ts">
	import { setContext, type Snippet } from 'svelte';
	import { cn } from '@utils/cn';

	interface TabsContext {
		value: any;
		setTab: (val: any) => void;
	}

	interface Props {
		value: any;
		onValueChange?: (event: { value: any }) => void;
		fluid?: boolean;
		children?: Snippet;
		class?: string;
	}

	let {
		value = $bindable(),
		onValueChange,
		fluid = false,
		children,
		class: className = ''
	}: Props = $props();

	setContext<TabsContext>('TABS_CONTEXT', {
		get value() { return value; },
		setTab: (val) => {
			value = val;
			onValueChange?.({ value: val });
		}
	});
</script>

<div class={cn("tabs-container flex flex-col", className, fluid && "w-full")}>
	{@render children?.()}
</div>
