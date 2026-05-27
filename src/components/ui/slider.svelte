<!--
@file src/components/ui/slider.svelte
@component
**SveltyCMS Slider Primitive**

### Props
- `value` (number): Bindable current value of the slider.
- `min` (number): Minimum value (default: 0).
- `max` (number): Maximum value (default: 100).
- `step` (number): Incremental step value (default: 1).
- `disabled` (boolean): Disable slider interaction.
- `class` (string): Additional CSS classes.
- `onchange` (function): Triggered when value changes.
- `aria-label` (string): Screen reader accessible name (default: 'Range Slider').
- `aria-labelledby` (string): Associated element ID for naming.

### Features:
- WCAG 3.0 compliant range input
- Premium look with custom webkit and moz range thumb styling
-->

<script lang="ts">
import { cn } from '@utils/cn';

interface Props {
	value?: number;
	min?: number;
	max?: number;
	step?: number;
	disabled?: boolean;
	class?: string;
	onchange?: (value: number) => void;
	'aria-label'?: string;
	'aria-labelledby'?: string;
}

let {
	value = $bindable(0),
	min = 0,
	max = 100,
	step = 1,
	disabled = false,
	class: className = '',
	onchange,
	'aria-label': ariaLabel = 'Range Slider',
	'aria-labelledby': ariaLabelledby,
}: Props = $props();

const percentage = $derived(((value - min) / (max - min)) * 100);

function handleInput(e: Event) {
	const val = parseFloat((e.target as HTMLInputElement).value);
	value = val;
	onchange?.(val);
}
</script>

<div class={cn('relative w-full py-4', className)}>
	<input
		type="range"
		{min}
		{max}
		{step}
		{disabled}
		value={value}
		aria-label={ariaLabel}
		aria-labelledby={ariaLabelledby}
		oninput={handleInput}
		class="h-2 w-full cursor-pointer appearance-none rounded-lg bg-surface-200 dark:bg-surface-700 accent-primary-500 transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:cursor-not-allowed disabled:opacity-50"
		style="--progress: {percentage}%"
	/>
</div>

<style>
input[type='range'] {
	background-image: linear-gradient(to right, var(--color-primary-500) var(--progress), transparent var(--progress));
}
/* Custom thumb styling for a premium look */
input[type='range']::-webkit-slider-thumb {
	appearance: none;
	width: 1.25rem;
	height: 1.25rem;
	background: white;
	border: 2px solid var(--color-primary-500);
	border-radius: 9999px;
	box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
	transition: all 0.2s;
}

input[type='range']::-webkit-slider-thumb:hover {
	transform: scale(1.1);
	box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}

input[type='range']::-webkit-slider-thumb:active {
	transform: scale(0.95);
}

/* Firefox Support */
input[type='range']::-moz-range-thumb {
	width: 1.25rem;
	height: 1.25rem;
	background: white;
	border: 2px solid var(--color-primary-500);
	border-radius: 9999px;
	box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
	transition: all 0.2s;
}
</style>
