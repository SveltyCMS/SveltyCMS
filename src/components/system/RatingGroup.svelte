<!--
@file src/components/system/RatingGroup.svelte
@component
Compatibility wrapper for Skeleton v4 Rating component.
Provides v2-like Ratings API using Skeleton v4 RatingGroup component.
-->

<script lang="ts">
	import { RatingGroup } from '@skeletonlabs/skeleton-svelte';
	import type { Snippet } from 'svelte';

	let {
		value = $bindable(0),
		max = 5,
		step = 1,
		interactive = true,
		name = 'rating',
		empty,
		half,
		full,
		...restProps
	}: {
		value?: number;
		max?: number;
		step?: number;
		interactive?: boolean;
		name?: string;
		empty?: Snippet;
		half?: Snippet;
		full?: Snippet;
		'aria-label'?: string;
		'aria-describedby'?: string;
		[key: string]: unknown;
	} = $props();

	// Generate rating items array
	const items = $derived(Array.from({ length: max }, (_, i) => i + 1));

	function handleValueChange(details: { value: number }) {
		value = details.value;
	}
</script>

<RatingGroup
	{value}
	count={max}
	disabled={!interactive}
	{name}
	onValueChange={handleValueChange}
	aria-label={restProps['aria-label']}
	aria-describedby={restProps['aria-describedby']}
	class={restProps.class as string}
>
	<RatingGroup.Control class="flex gap-1">
		{#each items as item (item)}
			<RatingGroup.Item value={item} class="cursor-pointer">
				{#if value >= item}
					{#if full}
						{@render full()}
					{:else}
						<span class="text-warning-500">★</span>
					{/if}
				{:else}
					{#if empty}
						{@render empty()}
					{:else}
						<span class="text-gray-400">☆</span>
					{/if}
				{/if}
			</RatingGroup.Item>
		{/each}
	</RatingGroup.Control>
</RatingGroup>
