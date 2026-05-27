<!--
@file src/components/ui/progress.svelte
@component
**SveltyCMS Progress Primitive**

### Props
- `value` (number): Current progress value.
- `max` (number): Maximum value (default: 100).
- `min` (number): Minimum value (default: 0).
- `indeterminate` (boolean): Whether the progress is indeterminate (animated).
- `color` (string): The color theme of the progress bar.
- `height` (string): Height class of the progress bar (default: 'h-2').
- `class` (string): Additional CSS classes.

### Features:
- WCAG 3.0 compliant role="progressbar"
- Indeterminate state support with CSS animation (respects prefers-reduced-motion)
-->

<script lang="ts">
import { cn } from '@utils/cn';
import { onMount } from 'svelte';
import type { HTMLAttributes } from 'svelte/elements';

type Props = HTMLAttributes<HTMLDivElement> & {
	value?: number;
	max?: number;
	min?: number;
	indeterminate?: boolean;
	color?: 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error' | 'surface';
	height?: string;
	class?: string;
};

let {
	value = 0,
	max = 100,
	min = 0,
	indeterminate = false,
	color = 'primary',
	height = 'h-2',
	class: className,
	...rest
}: Props = $props();

let prefersReducedMotion = $state(false);

onMount(() => {
	const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
	prefersReducedMotion = mq.matches;
	const handler = (e: MediaQueryListEvent) => { prefersReducedMotion = e.matches; };
	mq.addEventListener('change', handler);
	return () => mq.removeEventListener('change', handler);
});

const percentage = $derived(indeterminate ? 100 : Math.min(Math.max(((value - min) / (max - min)) * 100, 0), 100));

const classes = $derived(cn(
	'relative overflow-hidden rounded-full bg-surface-200 dark:bg-surface-800',
	height,
	className
));

const rangeClasses = $derived(cn(
	'h-full w-full flex-1 transition-all duration-500 ease-in-out',
	`bg-${color}-500`,
	indeterminate && !prefersReducedMotion && 'animate-progress-indeterminate'
));
</script>

<div
	class={classes}
	role="progressbar"
	aria-valuemin={min}
	aria-valuemax={max}
	aria-valuenow={indeterminate ? undefined : value}
	aria-label={rest['aria-label'] || 'Progress'}
	{...rest}
>
	<div
		class={rangeClasses}
		style={!indeterminate ? `transform: translateX(-${100 - percentage}%)` : ''}
	></div>
</div>

<style>
@keyframes progress-indeterminate {
	0% { transform: translateX(-100%); width: 30%; }
	50% { transform: translateX(0%); width: 100%; }
	100% { transform: translateX(100%); width: 30%; }
}

.animate-progress-indeterminate {
	animation: progress-indeterminate 1.5s infinite linear;
	width: 30%;
}
</style>
