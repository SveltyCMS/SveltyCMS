<!-- 
 @src/routes/api/cms.ts src/components/ui/tabs/tabs.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Tabs Primitive
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
