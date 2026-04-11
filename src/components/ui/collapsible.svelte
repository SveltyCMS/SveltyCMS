<!-- 
 @src/routes/api/cms.ts src/components/ui/collapsible.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Collapsible Primitive
-->

<script lang="ts">
import { cn } from '@utils/cn';
import { slide } from 'svelte/transition';
import type { Snippet } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';

type Props = HTMLAttributes<HTMLDivElement> & {
	open?: boolean;
	disabled?: boolean;
	trigger: Snippet;
	children: Snippet;
	direction?: 'vertical' | 'horizontal';
	class?: string;
};

let { 
	open = $bindable(false), 
	disabled = false, 
	trigger, 
	children, 
	direction = 'vertical',
	class: className,
	...rest 
}: Props = $props();

function toggle() {
	if (disabled) return;
	open = !open;
}
</script>

<div class={cn('flex flex-col overflow-hidden', className)} {...rest}>
	<div 
		role="button" 
		tabindex={disabled ? -1 : 0}
		aria-expanded={open}
		aria-disabled={disabled}
		aria-controls="collapsible-content"
		onclick={toggle}
		onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle()}
		class={cn('cursor-pointer select-none', disabled && 'opacity-50 cursor-not-allowed')}
	>
		{@render trigger()}
	</div>

	{#if open}
		<div 
			id="collapsible-content"
			transition:slide={{ axis: direction === 'vertical' ? 'y' : 'x', duration: 250 }}
			class="overflow-hidden"
		>
			<div class="p-4 pt-0">
				{@render children()}
			</div>
		</div>
	{/if}
</div>
