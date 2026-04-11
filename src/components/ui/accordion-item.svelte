<!-- 
 @src/routes/api/cms.ts src/components/ui/accordion-item.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 AccordionItem Primitive
-->

<script lang="ts">
import { getContext } from 'svelte';
import { cn } from '@utils/cn';
import Collapsible from './collapsible.svelte';

interface Props {
	id?: string;
	title: string;
	icon?: string;
	disabled?: boolean;
	open?: boolean;
	class?: string;
	children: import('svelte').Snippet;
}

let { 
	id = crypto.randomUUID(),
	title, 
	icon, 
	disabled = false, 
	open = $bindable(false),
	class: className, 
	children 
}: Props = $props();

const context = getContext<{ activeId: string | null, setActive: (id: string | null) => void, autoclose: boolean }>('accordion');

// If inside an accordion, sync with its state
$effect(() => {
	if (context && context.activeId === id) {
		open = true;
	} else if (context && context.autoclose && context.activeId !== id) {
		open = false;
	}
});

function handleToggle() {
	if (disabled) return;
	if (context) {
		context.setActive(open ? null : id);
	} else {
		open = !open;
	}
}
</script>

<div class={cn('w-full', className)}>
	<Collapsible 
		bind:open 
		{disabled} 
		class="w-full"
	>
		{#snippet trigger()}
			<button 
				type="button"
				class={cn(
					'flex items-center justify-between w-full p-4 text-left transition-colors focus:outline-none focus:ring-1 focus:ring-primary-500',
					open ? 'bg-surface-100 dark:bg-surface-800/50' : 'hover:bg-surface-50 dark:hover:bg-surface-800/20',
					disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
				)}
				onclick={handleToggle}
				{disabled}
			>
				<div class="flex items-center gap-3">
					{#if icon}
						<iconify-icon icon={icon} width="20" class="text-primary-500"></iconify-icon>
					{/if}
					<span class="font-bold text-surface-900 dark:text-white">{title}</span>
				</div>
				<iconify-icon 
					icon="mdi:chevron-down" 
					width="24" 
					class={cn('transition-transform duration-300 opacity-50', open && 'rotate-180')}
				></iconify-icon>
		</button>
	{/snippet}

		<div class="p-4 bg-white/50 dark:bg-surface-900/10">
			{@render children()}
		</div>
	</Collapsible>
</div>
