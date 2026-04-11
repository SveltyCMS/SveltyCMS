<!-- 
 @src/routes/api/cms.ts src/components/ui/tabs/trigger.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Trigger Primitive
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
	}

	let { value: triggerValue, disabled = false, children, class: className = '' }: Props = $props();
	
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
	class={cn(
		'relative flex items-center gap-1 px-4 py-2 text-sm font-medium transition-all duration-200 focus:outline-none border-b-2 -mb-[2px] whitespace-nowrap',
		active 
			? 'border-primary-500 text-primary-500' 
			: 'border-transparent text-surface-500 hover:text-surface-900 dark:hover:text-white',
		disabled && 'opacity-50 cursor-not-allowed',
		className
	)}
	onclick={handleClick}
>
	{@render children?.()}
</button>
