<!-- 
@files src/routes/(app)/config/collection/Unassigned.svelte
@component
**This component displays a list of unassigned collections**

### Props
- `items` {any[]} - Array of unassigned collection items
- `onDrop` {Function} - Callback function to handle drop events

### Features
- Drag and drop support for reassigning collections
-->
<script lang="ts">
import { Unassigned_Collections } from "@src/paraglide/messages";
import { flip } from "svelte/animate";
import { untrack } from "svelte";
import { draggable, droppable } from "@thisux/sveltednd";
import type { DragDropState } from "@thisux/sveltednd";

const flipDurationMs = 200;

interface Props {
	items: any;
	onDrop: any;
}

let { items = $bindable(), onDrop }: Props = $props();

	function handleDrop(state: DragDropState<any>) {
	const dragged = state.draggedItem;
	if (!dragged) return;

	const fromIndex = items.indexOf(dragged);
	if (fromIndex < 0) return;

	// Find target item via data-item-id attribute
	const targetEl = state.targetElement?.closest('[data-item-id]') as HTMLElement | null;
	const targetItemId = targetEl?.dataset?.itemId;

	let targetIndex: number;
	if (targetItemId) {
		targetIndex = items.findIndex((i: any) => i.id === targetItemId);
		if (state.dropPosition === 'after') targetIndex++;
	} else {
		targetIndex = items.length;
	}
	targetIndex = Math.max(0, Math.min(targetIndex, items.length));

	if (fromIndex === targetIndex) return;

	items = untrack(() => {
		const copy = [...items];
		copy.splice(fromIndex, 1);
		const adjusted = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
		copy.splice(adjusted, 0, dragged);
		return copy;
	});
	onDrop(items);
}
</script>

<div class="ms-1 rounded-sm border-2 border-tertiary-500">
	<h2 class="mb-2 text-center font-bold dark:text-white">{Unassigned_Collections()}</h2>
	<div
		class="flex w-full flex-wrap overflow-x-auto p-2"
		use:droppable={{
			container: 'unassigned',
			callbacks: { onDrop: handleDrop },
			direction: 'horizontal',
			attributes: { dragOverClass: 'bg-secondary-200' }
		}}
		role="list"
		aria-label="Unassigned collections"
	>
		{#each items as item (item.id)}
			<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
			<div
				class="mx-2 my-1 flex h-10 w-5/12 items-center justify-between overflow-x-auto rounded-sm border border-surface-700 bg-surface-300 text-center text-xs font-bold hover:bg-surface-400 dark:text-white"
				animate:flip={{ duration: flipDurationMs }}
				use:draggable={{ container: 'unassigned', dragData: item, keyboard: true }}
				use:droppable={{ container: 'unassigned', callbacks: { onDrop: handleDrop }, direction: 'horizontal', attributes: { dragOverClass: 'bg-secondary-200' } }}
				role="listitem"
				tabindex="0"
			>
				<iconify-icon icon="mdi:drag" width={24}></iconify-icon>

				<span class="break-word flex items-center gap-2">
					<iconify-icon icon={item.icon} width="18" class="text-error-500"></iconify-icon>
					{item.name}</span
				>

				<a
					href={`/collection/${item.name}/edit`}
					aria-label="Edit {item.name}"
					class="text-black hover:text-primary-500"
					data-sveltekit-preload-data="hover"
				>
					<iconify-icon icon="mdi:pen" width={24}></iconify-icon>
				</a>
			</div>
		{/each}
	</div>
</div>
