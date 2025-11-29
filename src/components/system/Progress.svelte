<!--
@file src/components/system/Progress.svelte
@component
Compatibility wrapper for Skeleton v4 Progress component.
Provides v2-like ProgressBar API using Skeleton v4 Progress component.
-->

<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';

	let {
		value = 0,
		max = 100,
		meter = 'bg-primary-500',
		track = 'bg-surface-300 dark:bg-surface-700',
		height = 'h-2',
		rounded = 'rounded-full',
		label,
		labelledby,
		...restProps
	}: {
		value?: number;
		max?: number;
		meter?: string;
		track?: string;
		height?: string;
		rounded?: string;
		label?: string;
		labelledby?: string;
		class?: string;
		[key: string]: unknown;
	} = $props();

	// Convert percentage value to fraction (0-1) for Skeleton v4
	const progressValue = $derived(max > 0 ? value / max : 0);
</script>

<Progress
	value={progressValue}
	max={1}
	aria-label={label}
	aria-labelledby={labelledby}
	class="{track} {height} {rounded} {restProps.class || ''}"
	{...restProps}
>
	<Progress.Track class="h-full {rounded} {track}">
		<Progress.Range class="{meter} {rounded}" />
	</Progress.Track>
</Progress>
