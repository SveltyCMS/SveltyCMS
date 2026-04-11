<!-- 
 @src/routes/api/cms.ts src/components/ui/tabs/content.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Content Primitive
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
