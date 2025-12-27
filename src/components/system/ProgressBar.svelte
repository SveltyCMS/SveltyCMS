<!--
@file src/components/system/ProgressBar.svelte
@component **Enhanced ProgressBar - Svelte 5 Optimized**

Accessible progress bar with animations, variants, and status indicators.

@example
<ProgressBar value={75} label="Upload Progress" />

### Props
- `value` (number): Progress percentage (0-100)
- `label` (string): Optional label text
- `color` (string): Progress bar color variant
- `size` ('sm' | 'md' | 'lg'): Size variant
- `animated` (boolean): Show animated stripes
- `showPercentage` (boolean): Show percentage text
- `indeterminate` (boolean): Indeterminate loading state

### Features
- Smooth animations with reduced motion support
- Multiple color variants
- Size variants (sm, md, lg)
- Optional animated stripes
- Indeterminate state for unknown progress
- ARIA accessibility
- Status indicators
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';

	type ColorVariant = 'blue' | 'green' | 'red' | 'yellow' | 'purple' | 'gray' | 'primary' | 'success' | 'error' | 'warning';
	type SizeVariant = 'sm' | 'md' | 'lg';

	interface Props {
		value?: number;
		label?: string;
		color?: ColorVariant;
		size?: SizeVariant;
		animated?: boolean;
		showPercentage?: boolean;
		indeterminate?: boolean;
	}

	const { value = 0, label = '', color = 'blue', size = 'md', animated = false, showPercentage = true, indeterminate = false }: Props = $props();

	// State
	let prefersReducedMotion = $state(false);

	// Clamp value between 0 and 100
	const clampedValue = $derived(Math.max(0, Math.min(100, value)));

	// Size classes
	const sizeClasses = $derived(
		{
			sm: 'h-2',
			md: 'h-3',
			lg: 'h-4'
		}[size]
	);

	// Color classes
	const colorClasses = $derived(
		{
			blue: 'bg-blue-600 dark:bg-blue-500',
			green: 'bg-green-600 dark:bg-green-500',
			red: 'bg-red-600 dark:bg-red-500',
			yellow: 'bg-yellow-600 dark:bg-yellow-500',
			purple: 'bg-purple-600 dark:bg-purple-500',
			gray: 'bg-gray-600 dark:bg-gray-500',
			primary: 'bg-primary-500',
			success: 'bg-success-500',
			error: 'bg-error-500',
			warning: 'bg-warning-500'
		}[color] || 'bg-blue-600'
	);

	// Status based on value
	const status = $derived(() => {
		if (indeterminate) return 'loading';
		if (clampedValue >= 100) return 'complete';
		if (clampedValue >= 75) return 'high';
		if (clampedValue >= 50) return 'medium';
		if (clampedValue >= 25) return 'low';
		return 'minimal';
	});

	// Status icon
	const statusIcon = $derived(() => {
		switch (status()) {
			case 'complete':
				return 'mdi:check-circle';
			case 'loading':
				return 'mdi:loading';
			default:
				return null;
		}
	});

	// Lifecycle
	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mediaQuery.matches;

		const handleChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};

		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	});
</script>

<div class="progress-container w-full" role="region" aria-label="Progress indicator">
	<!-- Label and percentage -->
	{#if label || showPercentage}
		<div class="mb-2 flex items-center justify-between">
			{#if label}
				<span class="text-sm font-medium text-gray-700 dark:text-gray-300" id="progress-label">
					{label}
				</span>
			{/if}

			{#if showPercentage && !indeterminate}
				<div class="flex items-center gap-2">
					{#if statusIcon()}
						<iconify-icon
							icon={statusIcon()!}
							width="16"
							class={status() === 'complete' ? 'text-success-500' : ''}
							class:animate-spin={status() === 'loading' && !prefersReducedMotion}
							aria-hidden="true"
						></iconify-icon>
					{/if}
					<span
						class="text-sm font-semibold {status() === 'complete' ? 'text-success-600 dark:text-success-400' : 'text-gray-500 dark:text-gray-400'}"
					>
						{Math.round(clampedValue)}%
					</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Progress bar -->
	<div
		class="w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700 {sizeClasses}"
		role="progressbar"
		aria-valuenow={indeterminate ? undefined : Math.round(clampedValue)}
		aria-valuemin={0}
		aria-valuemax={100}
		aria-label={label || 'Progress'}
		aria-valuetext={indeterminate ? 'Loading...' : `${Math.round(clampedValue)} percent`}
		aria-labelledby={label ? 'progress-label' : undefined}
	>
		{#if indeterminate}
			<!-- Indeterminate state -->
			<div
				class="h-full w-full {colorClasses} {prefersReducedMotion ? '' : 'animate-pulse'}"
				transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
			>
				{#if !prefersReducedMotion}
					<div class="h-full w-1/3 animate-[indeterminate_1.5s_ease-in-out_infinite] bg-white/30"></div>
				{/if}
			</div>
		{:else}
			<!-- Determinate state -->
			<div
				class="h-full rounded-full transition-all {prefersReducedMotion ? 'duration-0' : 'duration-500'} ease-out {colorClasses}
				       {animated && !prefersReducedMotion
					? 'animate-[stripes_1s_linear_infinite] bg-gradient-to-r from-current to-current bg-[length:1rem_1rem]'
					: ''}"
				style="width: {clampedValue}%; {animated && !prefersReducedMotion
					? 'background-image: linear-gradient(45deg, rgba(255,255,255,.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,.2) 50%, rgba(255,255,255,.2) 75%, transparent 75%, transparent);'
					: ''}"
			></div>
		{/if}
	</div>

	<!-- Status message (optional) -->
	{#if status() === 'complete'}
		<div class="mt-2 text-xs font-medium text-success-600 dark:text-success-400" transition:fade={{ duration: prefersReducedMotion ? 0 : 200 }}>
			✓ Complete
		</div>
	{/if}

	<!-- Screen reader announcement -->
	<div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
		{#if indeterminate}
			Loading...
		{:else if status() === 'complete'}
			Progress complete at 100 percent
		{:else}
			Progress at {Math.round(clampedValue)} percent
		{/if}
	</div>
</div>

<style>
	@keyframes indeterminate {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(400%);
		}
	}

	@keyframes stripes {
		0% {
			background-position: 0 0;
		}
		100% {
			background-position: 1rem 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		* {
			animation-duration: 0.01ms !important;
			animation-iteration-count: 1 !important;
			transition-duration: 0.01ms !important;
		}
	}
</style>
