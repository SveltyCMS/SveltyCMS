<!-- 
 @src/routes/api/cms.ts src/components/ui/toggle.svelte
 @src/components/system/admin-component-registry.ts
 Superior Svelte 5 Toggle Primitive
-->

<script lang="ts">
	import { cn } from '@utils/cn';
	import type { HTMLAttributes } from 'svelte/elements';

	type Props = {
		value?: boolean;
		label?: string;
		labelColor?: string;
		description?: string;
		disabled?: boolean;
		iconOn?: string;
		iconOff?: string;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
		onToggle?: (value: boolean) => void | Promise<any>;
	} & HTMLAttributes<HTMLDivElement>;

	let {
		value = $bindable(false),
		label,
		labelColor = 'text-primary-500',
		description,
		disabled = false,
		iconOn,
		iconOff,
		size = 'md',
		class: className,
		onToggle,
		...rest
	}: Props = $props();

	// Sizes
	const sizes = {
		sm: {
			track: 'h-6 w-10 min-w-[40px]',
			thumb: 'h-4 w-4 translate-x-1 peer-checked:translate-x-5',
			icon: '16'
		},
		md: {
			track: 'h-8 w-14 min-w-[48px]',
			thumb: 'h-6 w-6 translate-x-1 peer-checked:translate-x-7',
			icon: '24'
		},
		lg: {
			track: 'h-10 w-20 min-w-[56px]',
			thumb: 'h-8 w-8 translate-x-1 peer-checked:translate-x-11',
			icon: '32'
		}
	};

	function toggle() {
		if (disabled) return;
		value = !value;
		if (onToggle) onToggle(value);
	}

	const id = `toggle-${Math.random().toString(36).substring(7)}`;
</script>

<div class={cn('flex items-start gap-3', className)} {...rest}>
	<div class="relative flex h-full items-center">
		<input
			type="checkbox"
			class="peer sr-only"
			bind:checked={value}
			{disabled}
			{id}
			onchange={() => onToggle?.(value)}
		/>
		<button
			type="button"
			class={cn(
				'pointer-events-auto relative inline-flex shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-surface-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-surface-300 dark:ring-offset-surface-950',
				sizes[size].track,
				value ? 'bg-primary-500' : 'bg-error-500 transition-colors'
			)}
			onclick={toggle}
			{disabled}
			aria-checked={value}
			aria-label={label || 'Toggle switch'}
			role="switch"
		>
			<span
				class={cn(
					'pointer-events-none flex items-center justify-center rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 dark:bg-surface-100',
					sizes[size].thumb
				)}
			>
				{#if iconOn && iconOff}
					<iconify-icon
						icon={value ? iconOn : iconOff}
						width={sizes[size].icon}
						class={cn(value ? 'text-primary-500' : 'text-error-500', disabled && 'text-surface-600')}
					></iconify-icon>
				{:else}
					<span class={cn('text-[10px] font-bold', value ? 'text-primary-500' : 'text-error-500', disabled && 'text-surface-600')}>
						{value ? 'ON' : 'OFF'}
					</span>
				{/if}
			</span>
		</button>
	</div>

	{#if label || description}
		<div class="grid gap-1.5 leading-none">
			{#if label}
				<label
					for={id}
					class={cn(
						"text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
						value ? 'text-primary-500' : labelColor
					)}
				>
					{label}
				</label>
			{/if}
			{#if description}
				<p class="text-sm text-surface-500 dark:text-surface-400">
					{description}
				</p>
			{/if}
		</div>
	{/if}
</div>
