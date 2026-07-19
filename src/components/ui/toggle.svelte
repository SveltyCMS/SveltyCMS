<!--
@file src/components/ui/toggle.svelte
@component
**SveltyCMS Toggle Switch — WCAG 3.0 Ready**

iOS-style toggle switch with on/off icons, three sizes, label, description,
and `role="switch"` with `aria-checked` for maximum screen reader support.

### Props
- `value` (boolean): Bindable toggle state.
- `label` (string): Label text next to the toggle.
- `description` (string): Helper text below the label.
- `size` ('sm' | 'md' | 'lg'): Size variant.
- `iconOn` / `iconOff` (string): Iconify icons for each state.
- `disabled` (boolean): Disable interaction.
- `class` (string): Additional CSS classes.
- `onToggle` (function): Callback with new boolean state.

### Features:
- WCAG 3.0 ready with `role="switch"`, `aria-checked`, and `<label>` association
- green (on) / red (off) color transition on track
- sm/md/lg sizes with proportional thumb and icons
- full Svelte 5 runes: $props, $bindable, $derived
-->

<script lang="ts">
	import { cn } from '@utils/cn';
	import { generateId } from '@utils/id-generator';
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
		labelColor = 'text-tertiary-500 dark:text-primary-500',
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

	const id = generateId('toggle');
</script>

<div class={cn('flex gap-3 items-start md:items-center', className)} {...rest}>
	<div class="relative flex h-full items-center">
		<input aria-label="Input"
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
				'pointer-events-auto relative inline-flex shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-surface-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:focus:ring-surface-300 dark:ring-offset-surface-950',
				sizes[size].track,
				value ? 'bg-tertiary-500 dark:bg-primary-500' : 'bg-error-500 transition-colors'
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
						class={cn(value ? 'text-tertiary-500 dark:text-primary-500' : 'text-error-500', disabled && 'text-surface-600')}
					></iconify-icon>
				{:else}
					<span class={cn('text-[10px] font-bold', value ? 'text-tertiary-500 dark:text-primary-500' : 'text-error-500', disabled && 'text-surface-600')}>
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
						value ? 'text-tertiary-500 dark:text-primary-500' : labelColor
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
