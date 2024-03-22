<script lang="ts">
	// Component
	import Column from './Column.svelte';

	// Svelte DND-actions
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';

	const flipDurationMs = 300;

	export let columns: any;
	// will be called any time a card or a column gets dropped to update the parent data
	export let onFinalUpdate: any;

	function handleDndConsiderColumns(e: any) {
		columns = e.detail.items;
	}

	function handleDndFinalizeColumns(e: any) {
		onFinalUpdate(e.detail.items);
	}

	function handleItemFinalize(columnIdx: any, newItems: any) {
		//console.log('Item dropped in column', columnIdx);
		columns[columnIdx].items = newItems;
		//console.log('Updated Columns:', columns);
		onFinalUpdate([...columns]);
	}
</script>

<section
	class="ml-1 mr-4 mt-2 flex flex-wrap gap-1 md:mr-1"
	use:dndzone={{ items: columns, flipDurationMs, type: 'column' }}
	on:consider={handleDndConsiderColumns}
	on:finalize={handleDndFinalizeColumns}
>
	{#each columns as { id, name, icon, items }, idx (id)}
		<div
			class="w-full rounded-sm border-2 border-surface-400 p-2 sm:w-1/2 md:float-left md:w-1/3 lg:w-1/4"
			animate:flip={{ duration: flipDurationMs }}
		>
			<Column currentCategories={columns} {name} {icon} {items} onDrop={(newItems) => handleItemFinalize(idx, newItems)} />
		</div>
	{/each}
</section>
