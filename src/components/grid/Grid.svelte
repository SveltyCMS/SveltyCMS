<script lang="ts">
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';
	import type { GridColumn, GridSettings } from './types';

	const flipDurationMs = 200;

	let {
		columnItems = $bindable([]),
		gridSettings = {
			columns: 3,
			rows: 4,
			gap: '1em',
			padding: '0.5em',
			backgroundColor: 'transparent'
		},
		onfinalize = null
	} = $props<{
		columnItems: GridColumn[];
		gridSettings: GridSettings;
		onfinalize: ((columns: GridColumn[]) => void) | null;
	}>();

	$inspect(columnItems);

	function handleDndConsiderCards(cid: string, e: CustomEvent): void {
		const colIdx = columnItems.findIndex((c: GridColumn) => c.id === cid);
		columnItems[colIdx].items = e.detail.items;
	}

	function handleDndFinalizeCards(cid: string, e: CustomEvent): void {
		const colIdx = columnItems.findIndex((c: GridColumn) => c.id === cid);
		columnItems[colIdx].items = e.detail.items;
		onfinalize?.(columnItems);
	}
</script>

<section
	class="mb-10 grid h-[90vh] w-full items-start gap-4 p-2"
	style="
		grid-template-columns: repeat({columnItems.length}, 1fr);
		background-color: {gridSettings.backgroundColor};
	"
>
	{#each columnItems as column (column.id)}
		<div
			class="flex h-full flex-col overflow-y-hidden p-2"
			animate:flip={{ duration: flipDurationMs }}
			style="
				min-width: {column.settings?.minWidth || '250px'};
				max-width: {column.settings?.maxWidth || 'none'};
				background-color: {column.settings?.backgroundColor || 'transparent'};
				color: {column.settings?.color || 'inherit'};
			"
		>
			<div
				class="grid h-full flex-1 gap-2 overflow-y-auto py-2"
				style="
					grid-template-columns: repeat({gridSettings.columns}, 1fr);
					grid-template-rows: repeat({gridSettings.rows}, 1fr);
				"
				use:dndzone={{ items: column.items, flipDurationMs }}
				onconsider={(e) => handleDndConsiderCards(column.id, e)}
				onfinalize={(e) => handleDndFinalizeCards(column.id, e)}
			>
				{#each column.items as item (item.id)}
					<div
						class="my-1.5 flex min-h-0 items-center justify-center p-4"
						style="
							grid-column: span {item.span || 1};
							grid-row: span {item.heightSpan || 1};
						"
						animate:flip={{ duration: flipDurationMs }}
					>
						<div class="h-full w-full">
							{#if item.component}
								{@render item.component(item.props || {})}
							{:else}
								{item.name}
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/each}
</section>
