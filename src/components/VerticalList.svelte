<!-- 
@file src/components/VerticalList.svelte
@description  VerticalList component 
-->

<script lang="ts">
	import { dndzone } from 'svelte-dnd-action';
	import type { DndEvent } from 'svelte-dnd-action';

	interface Props {
		items: any;
		headers?: any[];
		flipDurationMs: number;
		handleDndConsider: (e: CustomEvent<DndEvent>) => void;
		handleDndFinalize: (e: CustomEvent<DndEvent>) => void;
		children?: import('svelte').Snippet;
	}

	let {
		items,
		headers = [],
		flipDurationMs,
		handleDndConsider,
		handleDndFinalize,
		children
	}: Props = $props();

	const gridClass = `grid grid-cols-${headers.length + 1} variant-ghost-tertiary dark:variant-ghost-primary w-full items-start justify-start p-1 py-2 pl-3 text-center font-semibold`;
</script>

<div class="h-full overflow-y-auto">
	<!-- Header -->
	{#if headers.length > 0}
		<div class={gridClass}>
			{#each headers as header}
				<div class="ml-2 text-left">{header}:</div>
			{/each}
		</div>
	{/if}

	<section use:dndzone={{ items: items, flipDurationMs }} onconsider={handleDndConsider} onfinalize={handleDndFinalize} class="my-1 w-full">
		<!-- Data -->
		{@render children?.()}
	</section>
</div>
