<!--
@file src/components/vertical-list.svelte
@component
**VerticalList component for displaying items in a vertical list with drag-and-drop functionality**

@example
<VerticalList  items={items}  headers={headers} container="widget-fields" onDrop={handleFieldDrop}>
	{#snippet children(item, index)}
		...
	{/snippet}
</VerticalList>

### Props
- `items` {array} - Array of items to be displayed in the list
- `headers` {array} - Array of headers for the table columns
- `container` {string} - Container key for sveltednd drag-and-drop
- `onDrop` {function} - Callback when an item is dropped
- `children` {function} - Snippet receiving each item and its index
-->

<script lang="ts">
	import { draggable, droppable } from '@thisux/sveltednd';
	import type { DragDropState } from '@thisux/sveltednd';

	interface Props {
		children?: import('svelte').Snippet<[Record<string, unknown>, number]>;
		onDrop: (state: DragDropState<any>) => void;
		headers?: string[];
		items: Record<string, unknown>[];
		container: string;
	}

	const { items, headers = [], onDrop, children, container }: Props = $props();

	const gridClass = $derived(
			`grid grid-cols-${headers.length + 1} preset-outlined-tertiary-500 dark:preset-outlined-primary-500 w-full items-start justify-start p-1 py-2 ps-3 text-center font-semibold`
		);
</script>

<div class="h-full overflow-y-auto" role="table" aria-label="List of items">
	<!-- Header -->
	{#if headers.length > 0}
		<div role="rowgroup">
			<div class={gridClass} role="row">
				{#each headers as header, index (index)}
					<div class="ms-2 text-start" role="columnheader">{header}:</div>
				{/each}
			</div>
		</div>
	{/if}

	<section
		use:droppable={{ container, onDrop }}
		class="my-1 w-full"
		role="rowgroup"
	>
		<!-- Data -->
		{#each items as item, index (index)}
			<div use:draggable={{ container, dragData: { item, index } }} role="row">
				{@render children?.(item, index)}
			</div>
		{/each}
	</section>
</div>
