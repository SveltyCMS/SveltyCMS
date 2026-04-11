<!-- 
 @src/routes/api/cms.ts src/components/ui/accordion.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Accordion Primitive
-->

<script lang="ts">
import { setContext } from 'svelte';
import { cn } from '@utils/cn';

interface Props {
	autoclose?: boolean; // Whether to close others when one opens
	class?: string;
	children: import('svelte').Snippet;
}

let { autoclose = true, class: className, children }: Props = $props();

let activeId = $state<string | null>(null);

// Provide context to AccordionItems
setContext('accordion', {
	get activeId() { return activeId; },
	setActive: (id: string | null) => {
		const shouldAutoClose = autoclose;
		activeId = shouldAutoClose && id === activeId ? null : id;
	},
	get autoclose() { return autoclose; }
});
</script>

<div class={cn('divide-y divide-surface-200 dark:divide-surface-800 border-y border-surface-200 dark:border-surface-800', className)}>
	{@render children()}
</div>
