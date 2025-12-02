<!--
@file src/components/system/Progress.svelte
@component
Compatibility wrapper for Skeleton v4 Progress component.
Provides v2-like ProgressBar API using Skeleton v4 Progress (Linear) component.

Based on: https://www.skeleton.dev/docs/svelte/framework-components/progress-linear

Usage:
```svelte
<script>
	import ProgressBar from '@components/system/Progress.svelte';
</script>

<ProgressBar value={50} max={100} />
```
-->

<script lang="ts">
	import { Progress } from '@skeletonlabs/skeleton-svelte';

	let {
		value = 0,
		max = 100,
		meter = 'bg-tertiary-500 dark:bg-primary-500',
		track = 'bg-surface-300 dark:bg-surface-700',
		height = 'h-2',
		rounded = 'rounded-full',
		label,
		labelledby,
		class: className = '',
		...restProps
	}: {
		value?: number | null;
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
</script>

<Progress
	value={value}
	max={max}
	aria-label={label}
	aria-labelledby={labelledby}
	class="{height} {rounded} {className}"
	{...restProps}
>
	<Progress.Track class="h-full {rounded} {track}">
		<Progress.Range class="{meter} {rounded}" />
	</Progress.Track>
</Progress>
