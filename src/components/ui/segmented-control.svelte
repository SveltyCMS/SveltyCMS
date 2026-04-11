<!-- 
 @src/routes/api/cms.ts src/components/ui/segmented-control.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 SegmentedControl Primitive
-->

<script lang="ts">
import { cn } from '@utils/cn';
import type { HTMLAttributes } from 'svelte/elements';

type Option = {
	label: string;
	value: any;
	icon?: string;
	disabled?: boolean;
};

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'value' | 'onchange'> & {
	options: Option[];
	value: any;
	name?: string;
	disabled?: boolean;
	rounded?: string;
	class?: string;
	onchange?: (value: any) => void;
};

let { 
	options = [], 
	value = $bindable(), 
	name = crypto.randomUUID(), 
	disabled = false, 
	rounded = 'rounded-token',
	class: className,
	onchange,
	...rest 
}: Props = $props();

const segmentClasses = $derived(cn(
	'flex bg-surface-200/50 dark:bg-surface-800/50 p-1',
	rounded,
	disabled && 'opacity-50 pointer-events-none',
	className
));

function select(val: any) {
	if (disabled) return;
	value = val;
	onchange?.(val);
}
</script>

<div class={segmentClasses} role="radiogroup" {...rest}>
	{#each options as option}
		{@const active = value === option.value}
		<button
			type="button"
			role="radio"
			aria-checked={active}
			disabled={disabled || option.disabled}
			class={cn(
				'flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium transition-all duration-200',
				rounded,
				active 
					? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-white shadow-sm' 
					: 'text-surface-600 dark:text-surface-400 hover:text-surface-900 dark:hover:text-white'
			)}
			onclick={() => select(option.value)}
		>
			{#if option.icon}
				<iconify-icon icon={option.icon} class="size-4"></iconify-icon>
			{/if}
			<span>{option.label}</span>
			
			<input 
				type="radio" 
				{name} 
				value={option.value} 
				checked={active} 
				class="sr-only" 
				tabindex="-1"
			/>
		</button>
	{/each}
</div>
