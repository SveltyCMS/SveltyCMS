<!--
@file src/widgets/custom/tags/display.svelte
@component
**Read-only display for the Tags widget**
-->

<script lang="ts">
	import type { FieldType } from './index';
	import Badge from '@components/ui/badge.svelte';

	interface Props {
		field: FieldType;
		value: string[] | null | undefined;
	}

	let { value = [] }: Props = $props();

	// Ensure value is an array
	const tags = $derived(Array.isArray(value) ? value : []);
</script>

<div class="flex flex-wrap gap-2">
	{#if tags.length > 0}
		{#each tags as tag, i (i)}
			<Badge variant="secondary" size="sm" class="px-2! py-1! rounded!">
				{tag}
			</Badge>
		{/each}
	{:else}
		<span class="text-surface-400 italic">No tags</span>
	{/if}
</div>
