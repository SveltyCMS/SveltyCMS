<script lang="ts">
	import { dndzone } from 'svelte-dnd-action';
	import type { DndEvent } from 'svelte-dnd-action';

	export let items: any;
	export let headers: any[] = [];
	export let flipDurationMs: number;
	export let handleDndConsider: (e: CustomEvent<DndEvent>) => void;
	export let handleDndFinalize: (e: CustomEvent<DndEvent>) => void;

	let gridClass = `grid grid-cols-${headers.length + 1} variant-ghost-primary w-full items-start justify-start p-1 py-2 pl-3 text-center font-semibold`;
</script>

<div>
	<!-- Header -->
	{#if headers.length > 0}
		<div class={gridClass}>
			{#each headers as header}
				<div class="ml-2 text-left">{header}:</div>
			{/each}
		</div>
	{/if}

	<section
		use:dndzone={{ items: fields, flipDurationMs }}
		on:consider={handleDndConsider}
		on:finalize={handleDndFinalize}
		class="my-1 w-full overflow-scroll border border-surface-400 p-2"
	>
		<!-- Data -->
		<slot />
	</section>
</div>
