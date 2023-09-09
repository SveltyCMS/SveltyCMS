<script lang="ts">
	import { dndzone } from 'svelte-dnd-action';
	import type { DndEvent } from 'svelte-dnd-action';

	export let items;
	export let flipDurationMs;
	export let handleDndConsider: (e: CustomEvent<DndEvent>) => void;
	export let handleDndFinalize: (e: CustomEvent<DndEvent>) => void;
	export let headers;
</script>

<div>
	<!-- Header -->
	<div
		class="flex w-full items-center gap-4 bg-primary-500 p-1 py-2 pl-3 text-center font-semibold"
	>
		{#each headers as header}
			<div class="text-black">{header}:</div>
		{/each}
	</div>

	<section
		use:dndzone={{ items, flipDurationMs }}
		on:consider={handleDndConsider}
		on:finalize={handleDndFinalize}
		class="my-2 w-full overflow-scroll border border-surface-400 p-2"
	>
		<!-- Data -->
		<slot />
	</section>
</div>
