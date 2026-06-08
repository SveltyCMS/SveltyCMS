<!--
@file src/components/ui/rating.svelte
@component
**SveltyCMS Rating — WCAG 3.0 Ready**

Interactive star rating with fractional support, half-star hover precision,
configurable step size, numeric value display, and full keyboard accessibility.

### Props
- `value` (number): Bindable rating value (supports fractional: 3.5, 4.7).
- `count` (number): Maximum rating value (default: 5).
- `step` (number): Increment step for keyboard and click precision (default: 0.5).
- `icon` (string): Iconify-icon for filled state (default: 'mdi:star').
- `iconEmpty` (string): Iconify-icon for empty state (default: 'mdi:star-outline').
- `disabled` (boolean): Disable interaction.
- `readonly` (boolean): Read-only display mode.
- `color` (string): Tailwind text color for filled stars (default: 'text-warning-500').
- `size` ('sm' | 'md' | 'lg'): Icon size preset (default: 'md').
- `showValue` (boolean): Show numeric indicator "3.5 / 5" next to stars.
- `class` (string): Additional CSS classes.
- `onchange` (function): Callback with new value on user interaction.

### Features:
- fractional fill via CSS overflow clip (any step: 0.5, 0.1, etc.)
- half-star precision on click and hover (start half = x.5, end half = x.0)
- hover state preview with real-time partial fill
- WCAG 3.0: role="slider", aria-valuemin/max/now, keyboard nav
- keyboard: Arrow keys (adjust by step), Home/End (min/max)
- numeric value indicator
- full Svelte 5 runes: $props, $bindable, $derived, $state
-->

<script lang="ts">
import { cn } from '@utils/cn';
import type { HTMLAttributes } from 'svelte/elements';

type Props = Omit<HTMLAttributes<HTMLDivElement>, 'value'> & {
	value?: number;
	count?: number;
	step?: number;
	icon?: string;
	iconEmpty?: string;
	disabled?: boolean;
	readonly?: boolean;
	color?: string;
	size?: 'sm' | 'md' | 'lg';
	showValue?: boolean;
	class?: string;
	onchange?: (value: number) => void;
};

let {
	value = $bindable(0),
	count = 5,
	step = 0.5,
	icon = 'mdi:star',
	iconEmpty = 'mdi:star-outline',
	disabled = false,
	readonly = false,
	color = 'text-warning-500',
	size = 'md',
	showValue = false,
	class: className,
	onchange,
	...rest
}: Props = $props();

let hoveredValue = $state(0);

const iconSize = $derived.by(() => {
	switch (size) {
		case 'sm': return '16';
		case 'lg': return '32';
		default:   return '24';
	}
});

function setValue(val: number) {
	if (disabled || readonly) return;
	const clamped = Math.min(count, Math.max(0, val));
	const rounded = Math.round(clamped / step) * step;
	value = Math.min(count, rounded);
	onchange?.(value);
}

function adjustValue(delta: number) {
	setValue(value + delta);
}

const displayValue = $derived(hoveredValue || value);

/** Calculate fill percentage (0–1) for star at 0-based index */
function starFill(displayVal: number, index: number): number {
	return Math.min(1, Math.max(0, displayVal - index));
}
</script>

<div
	class={cn('flex items-center gap-1', className)}
	role="slider"
	aria-valuemin={0}
	aria-valuemax={count}
	aria-valuenow={value}
	aria-valuetext={`${value} out of ${count}`}
	aria-label={rest['aria-label'] || 'Rating'}
	tabindex={disabled || readonly ? -1 : 0}
	onkeydown={(e) => {
		if (disabled || readonly) return;
		if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
			e.preventDefault();
			adjustValue(step);
		} else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
			e.preventDefault();
			adjustValue(-step);
		} else if (e.key === 'Home') {
			e.preventDefault();
			setValue(0);
		} else if (e.key === 'End') {
			e.preventDefault();
			setValue(count);
		}
	}}
	{...rest}
>
	{#each Array(count) as _, i}
		{const fill = starFill(displayValue, i)}
		{const fillPercent = fill * 100}
		{const isFull = fill >= 1}
		{const isEmpty = fill <= 0}

		<span
			role="presentation"
			class={cn(
				'relative inline-block transition-all duration-150',
				!disabled && !readonly && 'cursor-pointer hover:scale-110'
			)}
			onclick={(e) => {
				if (disabled || readonly) return;
				const rect = e.currentTarget.getBoundingClientRect();
				const x = e.clientX - rect.left;
				const half = x < rect.width / 2 ? step : (step >= 1 ? 1 : Math.ceil(1 / step) * step / Math.ceil(1 / step));
				// For step=0.5: start half adds 0.5, end half adds 1.0
				// For step=1: start half adds 0.5 rounded to 1, end half adds 1
				const nearestStep = Math.round((i + half) / step) * step;
				setValue(nearestStep);
			}}
			onmousemove={(e) => {
				if (disabled || readonly) return;
				const rect = e.currentTarget.getBoundingClientRect();
				const x = e.clientX - rect.left;
				hoveredValue = i + (x < rect.width / 2 ? step : 1);
			}}
			onmouseleave={() => (hoveredValue = 0)}
		>
			<!-- Empty star (always visible as background) -->
			<iconify-icon
				icon={iconEmpty}
				width={iconSize}
				class={cn(
					'transition-colors duration-150',
					isEmpty ? 'text-surface-300 dark:text-surface-600' : color
				)}
			></iconify-icon>

			<!-- Filled star overlay (clipped to fill percentage) -->
			{#if !isEmpty}
				<span
					class="absolute inset-0 overflow-hidden transition-all duration-150"
					style="width: {isFull ? '100%' : `${fillPercent}%`}"
					aria-hidden="true"
				>
					<iconify-icon
						icon={icon}
						width={iconSize}
						class={color}
					></iconify-icon>
				</span>
			{/if}
		</span>
	{/each}

	{#if showValue}
		<span class="ml-2 text-sm font-medium text-surface-500 dark:text-surface-400 tabular-nums">
			{value} / {count}
		</span>
	{/if}
</div>
