<!--
@file src/widgets/custom/block-builder/display.svelte
@description Compact summary display for BlockBuilder fields in table and list views.
@component
@props {BlockInstance[]} value - List of active block instances.
-->
<script lang="ts">
	import Badge from "@components/ui/badge.svelte";
	import type { BlockInstance } from "./types";

	interface Props {
		field?: unknown;
		value?: BlockInstance[];
	}

	let { value = [] }: Props = $props();

	const blockList = $derived(Array.isArray(value) ? value : []);
	const blockCount = $derived(blockList.length);
	const previewTypes = $derived(
		Array.from(new Set(blockList.map((b) => b._type))).slice(0, 3),
	);
</script>

<div class="flex flex-wrap items-center gap-1.5 text-sm" data-testid="block-builder-display">
	{#if blockCount > 0}
		<Badge variant="primary" size="sm">
			{blockCount} {blockCount === 1 ? "block" : "blocks"}
		</Badge>
		{#each previewTypes as type}
			<span class="rounded bg-surface-500/10 px-1.5 py-0.5 text-xs font-mono uppercase tracking-wider text-surface-500">
				{type}
			</span>
		{/each}
		{#if blockList.length > 3}
			<span class="text-xs text-surface-400">+{blockList.length - 3}</span>
		{/if}
	{:else}
		<span class="text-surface-400 italic text-xs">Empty layout</span>
	{/if}
</div>
