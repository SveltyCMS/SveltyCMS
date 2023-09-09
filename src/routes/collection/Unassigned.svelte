<script lang="ts">
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';
	import { goto } from '$app/navigation';

	const flipDurationMs = 200;
	export let items: any;
	export let onDrop: any;

	function handleDndConsiderCards(e) {
		items = e.detail.items;
	}

	function handleDndFinalizeCards(e) {
		//console.log('Unassigned items:', e.detail.items); // <-- add this line
		onDrop(e.detail.items);
	}

	function handleCollectionClick(collectionName: string) {
		// Define the logic for handling the click on a collection
		goto(`/collection/${collectionName}/edit`);
	}
</script>

<div class="ml-1 rounded-sm border border-surface-300 dark:border-surface-400">
	<h2 class="mb-2 text-center font-bold dark:text-primary-500">Unassigned</h2>
	<div
		class="my-1 flex w-full flex-wrap gap-1 overflow-x-scroll"
		use:dndzone={{ items, flipDurationMs }}
		on:consider={handleDndConsiderCards}
		on:finalize={handleDndFinalizeCards}
	>
		{#each items as item (item.id)}
			<div
				class="mx-2 my-1 flex h-10 w-3/12 items-center justify-between rounded-sm border border-surface-700 bg-surface-300 text-center text-xs font-bold hover:bg-surface-400 dark:text-white"
				animate:flip={{ duration: flipDurationMs }}
			>
				<iconify-icon icon="mdi:drag" width="18" class="pl-0.5" />

				<span class="break-word flex items-center gap-2">
					<iconify-icon icon={item.icon} width="18" class="text-error-500" />
					{item.name}</span
				>

				<button class="text-black" on:click={() => handleCollectionClick(item.name)}
					><iconify-icon icon="mdi:pen" width="18" class="pr-0.5" /></button
				>
			</div>
		{/each}
	</div>
</div>
