<!--
@file src/components/ui/rating.svelte
@component
**SveltyCMS Rating Primitive**

### Props
- `value` (number): Current rating value (bindable).
- `count` (number): Maximum rating value (default: 5).
- `icon` (string): Iconify-icon name for filled state.
- `iconEmpty` (string): Iconify-icon name for empty state.
- `disabled` (boolean): Whether input is disabled.
- `readonly` (boolean): Whether input is read-only.
- `color` (string): Text color class.
- `class` (string): Additional CSS classes.

### Features:
- WCAG 3.0 compliant role="slider"
- keyboard accessibility (arrow keys, home, end)
- hover state preview
-->

<script lang="ts">
import { cn } from '@utils/cn';
import type { HTMLAttributes } from 'svelte/elements';

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'value'> & {
	value?: number;
	count?: number;
	icon?: string;
	iconEmpty?: string;
	disabled?: boolean;
	readonly?: boolean;
	color?: string;
	class?: string;
};

let {
	value = $bindable(0),
	count = 5,
	icon = 'mdi:star',
	iconEmpty = 'mdi:star-outline',
	disabled = false,
	readonly = false,
	color = 'text-warning-500',
	class: className,
	...rest
}: Props = $props();

let hoveredValue = $state(0);

function setValue(val: number) {
	if (disabled || readonly) return;
	value = val;
}

const displayValue = $derived(hoveredValue || value);
</script>

<div
	class={cn('flex items-center gap-1', className)}
	role="slider"
	aria-valuemin={0}
	aria-valuemax={count}
	aria-valuenow={value}
	aria-label={rest['aria-label'] || 'Rating'}
	tabindex={disabled || readonly ? -1 : 0}
	onkeydown={(e) => {
		if (disabled || readonly) return;
		if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
			e.preventDefault();
			value = Math.min(count, value + 1);
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
			e.preventDefault();
			value = Math.max(0, value - 1);
		} else if (e.key === 'Home') {
			e.preventDefault();
			value = 0;
		} else if (e.key === 'End') {
			e.preventDefault();
			value = count;
		}
	}}
	{...rest}
>
	{#each Array(count) as _, i}
		{@const index = i + 1}
		{@const active = index <= displayValue}
		<span
			role="presentation"
			class={cn(
				'transition-all duration-150',
				active ? color : 'text-surface-300 dark:text-surface-600',
				!disabled && !readonly && 'hover:scale-120 cursor-pointer'
			)}
			onclick={() => setValue(index)}
			onmouseenter={() => !disabled && !readonly && (hoveredValue = index)}
			onmouseleave={() => (hoveredValue = 0)}
		>
			<iconify-icon
				icon={active ? icon : iconEmpty}
				width="24"
			></iconify-icon>
		</span>
	{/each}
</div>
