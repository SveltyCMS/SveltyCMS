<!--
@file src/components/system/SliderCompat.svelte
@component
Compatibility wrapper for Skeleton v4 Slider component.
Provides v2-like RangeSlider API using Skeleton v4 Slider component.

Based on: https://www.skeleton.dev/docs/svelte/framework-components/slider

Usage:
```svelte
<script>
	import RangeSlider from '@components/system/SliderCompat.svelte';
</script>

<RangeSlider name="range" value={50} max={100} step={1} />
```
-->

<script lang="ts">
	import { Slider } from '@skeletonlabs/skeleton-svelte';

	let {
		name = 'slider',
		value = $bindable(0),
		min = 0,
		max = 100,
		step = 1,
		ticked = false,
		disabled = false,
		accent = 'accent-tertiary-500 dark:accent-primary-500',
		class: className = '',
		onchange,
		...restProps
	}: {
		name?: string;
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		ticked?: boolean;
		disabled?: boolean;
		accent?: string;
		class?: string;
		onchange?: (event: Event) => void;
		[key: string]: unknown;
	} = $props();

	// Generate tick marks if ticked is true
	const tickCount = $derived(ticked ? Math.floor((max - min) / step) + 1 : 0);
	const tickValues = $derived(
		ticked 
			? Array.from({ length: tickCount }, (_, i) => min + i * step)
			: []
	);

	function handleValueChange(details: { value: number[] }) {
		value = details.value[0];
		if (onchange) {
			const event = new CustomEvent('change', { detail: value });
			onchange(event);
		}
	}
</script>

<Slider
	{name}
	value={[value]}
	{min}
	{max}
	{step}
	{disabled}
	onValueChange={handleValueChange}
	class="{accent} {className}"
	{...restProps}
>
	<Slider.Control>
		<Slider.Track class="bg-surface-300 dark:bg-surface-700">
			<Slider.Range class="bg-tertiary-500 dark:bg-primary-500" />
		</Slider.Track>
		<Slider.Thumb index={0} class="bg-tertiary-500 dark:bg-primary-500 border-2 border-white shadow-md">
			<Slider.HiddenInput />
		</Slider.Thumb>
	</Slider.Control>
	{#if ticked && tickValues.length > 0}
		<Slider.MarkerGroup>
			{#each tickValues as tickValue}
				<Slider.Marker value={tickValue} />
			{/each}
		</Slider.MarkerGroup>
	{/if}
</Slider>
