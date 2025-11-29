<!--
@file src/components/system/SliderCompat.svelte
@component
Compatibility wrapper for Skeleton v4 Slider component.
Provides v2-like RangeSlider API using Skeleton v4 Slider component.
-->

<script lang="ts">
	import { Slider } from '@skeletonlabs/skeleton-svelte';

	let {
		value = $bindable(0),
		min = 0,
		max = 100,
		step = 1,
		ticked = false,
		name = 'slider',
		disabled = false,
		onchange,
		...restProps
	}: {
		value?: number;
		min?: number;
		max?: number;
		step?: number;
		ticked?: boolean;
		name?: string;
		disabled?: boolean;
		onchange?: (event: Event) => void;
		class?: string;
		[key: string]: unknown;
	} = $props();

	// For ticked mode, generate tick marks
	const ticks = $derived.by(() => {
		if (!ticked) return [];
		const tickCount = Math.floor((max - min) / step) + 1;
		return Array.from({ length: tickCount }, (_, i) => min + i * step);
	});

	function handleValueChange(details: { value: number[] }) {
		value = details.value[0] ?? 0;
		if (onchange) {
			const event = new CustomEvent('change', { detail: value });
			onchange(event);
		}
	}
</script>

<Slider
	value={[value]}
	{min}
	{max}
	{step}
	{disabled}
	{name}
	onValueChange={handleValueChange}
	class={restProps.class as string}
>
	<Slider.Control>
		<Slider.Track>
			<Slider.Range />
		</Slider.Track>
		<Slider.Thumb index={0} />
	</Slider.Control>
	{#if ticked}
		<Slider.MarkerGroup>
			{#each ticks as tick (tick)}
				<Slider.Marker value={tick}>{tick}</Slider.Marker>
			{/each}
		</Slider.MarkerGroup>
	{/if}
</Slider>
