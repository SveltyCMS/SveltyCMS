<!--
@file src/components/ui/loader.svelte
@component
**SveltyCMS Content Loader — WCAG 3.0 Ready**

Provides shimmer loading placeholders for text, circles, cards, and custom shapes.
Respects `prefers-reduced-motion` by disabling animation when requested.

### Props
- `variant` ('text' | 'circle' | 'card' | 'rect' | 'image'): Shape variant (default: 'text').
- `width` (string): CSS width override (e.g., '100%', '200px', 'w-full').
- `height` (string): CSS height override (e.g., '1rem', '200px', 'h-12').
- `lines` (number): Number of text lines to render (only for variant="text", default: 1).
- `lastLineWidth` (string): Width of the last text line (e.g., '60%') for realistic text blocks.
- `class` (string): Additional CSS classes.
- `ariaLabel` (string): Accessible label for screen readers (default: 'Loading...').

### Accessibility Features (WCAG 3.0)
- `role="status"` + `aria-label` for screen reader announcement
- `aria-busy="true"` on the wrapper
- Respects `prefers-reduced-motion` — disables shimmer when user prefers reduced motion
- Not focusable (presentational-only)

### Features:
- text variant with multiple lines and variable last-line width
- circle variant for avatars and icons
- card variant for full card placeholders
- image variant with embedded icon
- full Svelte 5 runes: $props, $derived, $state
-->

<script lang="ts">
	import { cn } from '@utils/cn';

	interface Props {
		variant?: 'text' | 'circle' | 'card' | 'rect' | 'image';
		width?: string;
		height?: string;
		lines?: number;
		lastLineWidth?: string;
		class?: string;
		ariaLabel?: string;
	}

	let {
		variant = 'text',
		width,
		height,
		lines = 1,
		lastLineWidth = '60%',
		class: className = '',
		ariaLabel = 'Loading...'
	}: Props = $props();

	let prefersReducedMotion = $state(false);

	$effect(() => {
		const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mq.matches;
		const handler = (e: MediaQueryListEvent) => { prefersReducedMotion = e.matches; };
		mq.addEventListener('change', handler);
		return () => mq.removeEventListener('change', handler);
	});

	const baseClass = 'bg-surface-200 dark:bg-surface-700 rounded';
	const shimmerClass = $derived(prefersReducedMotion ? '' : 'animate-pulse');

	const defaultDims = $derived.by(() => {
		switch (variant) {
			case 'circle': return { w: width || 'size-10', h: height || 'size-10' };
			case 'card': return { w: width || 'w-full', h: height || 'h-48' };
			case 'image': return { w: width || 'w-full', h: height || 'h-48' };
			case 'rect': return { w: width || 'w-full', h: height || 'h-4' };
			default: return { w: width || 'w-full', h: height || 'h-4' };
		}
	});

	const isCircle = $derived(variant === 'circle');
</script>

<div role="status" aria-label={ariaLabel} aria-busy="true" class={cn('flex flex-col gap-2', variant === 'text' && 'w-full', className)}>
	{#if variant === 'text'}
		{#each Array(lines) as _, i (i)}
			{const isLast = i === lines - 1}
			<div
				class={cn(
					baseClass,
					shimmerClass,
					defaultDims.h,
					isLast && lines > 1 ? lastLineWidth : 'w-full'
				)}
			></div>
		{/each}
	{:else if variant === 'card'}
		<div class={cn(baseClass, shimmerClass, 'w-full rounded overflow-hidden')}>
			<div class={cn(baseClass, shimmerClass, 'w-full', height || 'h-32', 'rounded-none!')}></div>
			<div class="p-4 flex flex-col gap-2">
				<div class={cn(baseClass, shimmerClass, 'h-4 w-3/4')}></div>
				<div class={cn(baseClass, shimmerClass, 'h-3 w-1/2')}></div>
				<div class={cn(baseClass, shimmerClass, 'h-3 w-5/6')}></div>
			</div>
		</div>
	{:else if variant === 'image'}
		<div class={cn(baseClass, shimmerClass, defaultDims.w, defaultDims.h, 'rounded flex items-center justify-center')}>
			<iconify-icon icon="mdi:image-outline" width="48" class="text-surface-300 dark:text-surface-600" aria-hidden="true"></iconify-icon>
		</div>
	{:else}
		<!-- circle or rect -->
		<div
			class={cn(
				baseClass,
				shimmerClass,
				defaultDims.w,
				defaultDims.h,
				isCircle && 'rounded-full'
			)}
		></div>
	{/if}

	<span class="sr-only">{ariaLabel}</span>
</div>

<style>
	@media (prefers-reduced-motion: reduce) {
		.animate-pulse {
			animation: none;
		}
	}
</style>
