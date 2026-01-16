<!--
@file src/components/system/Progress.svelte
@description Progress bar component for showing loading states
@props
- value: number (0-100) - Progress percentage
- label?: string - Optional label text
- color?: string - Progress bar color
- size?: 'sm' | 'md' | 'lg' - Size variant
-->

<script lang="ts">
	// Props
	export let value: number = 0;
	export let label: string = '';
	export let color: string = 'blue';
	export let size: 'sm' | 'md' | 'lg' = 'md';

	// Ensure value is between 0 and 100
	$: clampedValue = Math.max(0, Math.min(100, value));

	// Size classes
	$: sizeClasses = {
		sm: 'h-2',
		md: 'h-3',
		lg: 'h-4'
	}[size];

	// Color classes
	$: colorClasses =
		{
			blue: 'bg-blue-600',
			green: 'bg-green-600',
			red: 'bg-red-600',
			yellow: 'bg-yellow-600',
			purple: 'bg-purple-600',
			gray: 'bg-gray-600'
		}[color] || 'bg-blue-600';
</script>

<div class="progress-container">
	{#if label}
		<div class="mb-2 flex items-center justify-between">
			<span class="text-sm font-medium text-gray-700 dark:text-gray-300">
				{label}
			</span>
			<span class="text-sm text-gray-500 dark:text-gray-400">
				{Math.round(clampedValue)}%
			</span>
		</div>
	{/if}

	<div class="w-full rounded-full bg-gray-200 dark:bg-gray-700 {sizeClasses}">
		<div class="rounded-full transition-all duration-300 ease-out {sizeClasses} {colorClasses}" style="width: {clampedValue}%"></div>
	</div>
</div>

<style>
	.progress-container {
		width: 100%;
	}
</style>
