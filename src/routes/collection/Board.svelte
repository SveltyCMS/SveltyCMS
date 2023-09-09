<script lang="ts">
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';
	import { createEventDispatcher } from 'svelte';
	import Column from './Column.svelte';
	const flipDurationMs = 300;

	export let columns: any;
	// will be called any time a card or a column gets dropped to update the parent data
	export let onFinalUpdate: any;

	function handleDndConsiderColumns(e) {
		columns = e.detail.items;
	}

	function handleDndFinalizeColumns(e) {
		onFinalUpdate(e.detail.items);
	}

	function handleItemFinalize(columnIdx, newItems) {
		columns[columnIdx].items = newItems;
		onFinalUpdate([...columns]);
	}

	// const dispatch = createEventDispatcher();

	// function handleColumnNameClick(column) {
	// 	dispatch('columnnameclick', column);
	// }
</script>

<section
	class="ml-1 mr-2 mt-2 flex flex-wrap gap-1 md:mr-1"
	use:dndzone={{ items: columns, flipDurationMs, type: 'column' }}
	on:consider={handleDndConsiderColumns}
	on:finalize={handleDndFinalizeColumns}
>
	{#each columns as { id, name, icon, items }, idx (id)}
		<div
			class="w-full rounded-sm border border-surface-300 p-2 dark:border-surface-400 sm:w-1/2 md:float-left md:w-1/4"
			animate:flip={{ duration: flipDurationMs }}
		>
			<Column {name} {icon} {items} onDrop={(newItems) => handleItemFinalize(idx, newItems)} />
		</div>
	{/each}
</section>
