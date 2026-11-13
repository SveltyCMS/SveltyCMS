<!--
@file src/components/collection-display/entry-list-column-manager.svelte
@description
Drag-and-drop column manager for reordering and toggling column visibility in the collection entry table.

@component
**EntryListColumnManager**

Features:
- Drag-and-drop column reordering with keyboard accessibility via @thisux/sveltednd
- Select-all column visibility toggle
- View reset button to restore default column order and visibility
- WCAG-compliant accessible drag handles and button states

@props
- `displayTableHeaders` (TableHeader[]): Current visible/ordered table headers.
- `onHeadersChange` ((headers: TableHeader[]) => void): Callback fired when headers are reordered or visibility changes.
- `onResetView` (() => void): Callback fired when the reset view button is clicked.
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import { SMART_TABLE_COLUMN_MANAGER } from '@components/ui/smart-table/chrome';
	import { CONTENT_PADDING } from './content-classes';
	import type { TableHeader } from '@src/content/types';
	import { entrylist_all, entrylist_dnd, entrylist_reset_view } from '@src/paraglide/messages';
	import { draggable, droppable, type DragDropState } from '@thisux/sveltednd';
	import { flip } from 'svelte/animate';

	interface Props {
		displayTableHeaders: TableHeader[];
		onHeadersChange: (headers: TableHeader[]) => void;
		onResetView: () => void;
	}

	const { displayTableHeaders, onHeadersChange, onResetView }: Props = $props();

	const selectAllColumns = {
		get value() {
			return displayTableHeaders.length > 0 ? displayTableHeaders.every((h) => h.visible) : false;
		},
		set value(v: boolean) {
			const updated = displayTableHeaders.map((h) => ({ ...h, visible: v }));
			onHeadersChange(updated);
		}
	};

	function handleColumnDrop(state: DragDropState<TableHeader>) {
		const dragged = state.draggedItem;
		if (!dragged) return;

		const fromIndex = displayTableHeaders.findIndex(
			(h) => h.id === dragged.id || (Boolean(dragged.name) && h.name === dragged.name)
		);
		if (fromIndex < 0) return;

		const targetEl = state.targetElement?.closest('[data-header-id]') as HTMLElement | null;
		const targetHeaderId = targetEl?.dataset?.headerId;

		if (
			targetHeaderId &&
			(targetHeaderId === dragged.id || targetHeaderId === displayTableHeaders[fromIndex].id)
		) {
			return;
		}

		let targetIndex: number;
		if (targetHeaderId) {
			targetIndex = displayTableHeaders.findIndex((h) => h.id === targetHeaderId);
			if (targetIndex >= 0 && state.dropPosition === 'after') {
				targetIndex++;
			}
		} else {
			targetIndex = displayTableHeaders.length;
		}
		if (targetIndex < 0) targetIndex = displayTableHeaders.length;
		targetIndex = Math.max(0, Math.min(targetIndex, displayTableHeaders.length));

		if (fromIndex === targetIndex) return;

		const newItems = [...displayTableHeaders];
		const [movedItem] = newItems.splice(fromIndex, 1);
		const adjusted = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
		newItems.splice(adjusted, 0, movedItem);
		onHeadersChange(newItems);
	}

	function handleColumnVisibilityToggle(headerToToggle: TableHeader) {
		const updated = displayTableHeaders.map((h) =>
			h.id === headerToToggle.id ? { ...h, visible: !h.visible } : h
		);
		onHeadersChange(updated);
	}
</script>

<div class="shrink-0 {CONTENT_PADDING}">
	<div class={SMART_TABLE_COLUMN_MANAGER}>
		<div class="text-sm dark:text-primary-500">{entrylist_dnd()}</div>
		<!-- Select All Columns -->
		<div class="my-2 flex w-full flex-col items-center justify-center gap-2 sm:flex-row sm:gap-4">
			<div class="flex items-center gap-2">
				<Checkbox bind:checked={selectAllColumns.value} label={entrylist_all()} />

				<Button
					variant="outline"
					onclick={onResetView}
					aria-label={entrylist_reset_view()}
					class="bg-surface-400 text-white"
				>
					<iconify-icon icon="material-symbols-light:device-reset" width={24}></iconify-icon>
					Reset View
				</Button>
			</div>
			<!-- Droppable only on items (v0.7.0) — nested section+item droppables cause callback ambiguity -->
			<section
				class="flex w-full flex-wrap justify-center gap-2 p-2 border-2 border-dashed border-secondary-500/50 rounded transition-all hover:border-secondary-500"
				role="list"
				aria-label="Drag columns to reorder"
			>
				{#each displayTableHeaders as header (header.id)}
					<div
						animate:flip={{ duration: 300 }}
						use:draggable={{
							container: 'columns',
							dragData: header,
							keyboard: true,
							handle: '.column-drag-handle'
						}}
						use:droppable={{
							container: 'columns',
							callbacks: { onDrop: handleColumnDrop },
							direction: 'horizontal',
							attributes: { dragOverClass: 'ring-2 ring-primary-500 scale-105' }
						}}
						data-header-id={header.id}
						role="listitem"
						class="inline-flex items-center rounded-lg border transition-all {header.visible
							? 'bg-(--admin-bg-card) border-surface-500/30 dark:border-surface-600 text-(--admin-text-body)'
							: 'bg-surface-500/10 dark:bg-surface-900/50 border-dashed border-surface-500 dark:border-surface-600 text-(--admin-text-muted)'}"
					>
						<button
							type="button"
							class="column-drag-handle cursor-grab active:cursor-grabbing p-1.5 inline-flex items-center justify-center text-surface-400 hover:text-primary-500 dark:hover:text-primary-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
							aria-label={`Drag to reorder column ${header.label}. Press Space to grab, arrows to move.`}
							title="Drag to reorder"
						>
							<iconify-icon icon="mdi:drag-vertical" width={18}></iconify-icon>
						</button>

						<button
							type="button"
							onclick={() => handleColumnVisibilityToggle(header)}
							aria-label={`Toggle visibility of ${header.label} column`}
							class="inline-flex items-center gap-1.5 py-1 pe-2.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 rounded"
						>
							{#if header.visible}
								<iconify-icon icon="fa:check" width={14} class="text-success-500"></iconify-icon>
							{:else}
								<iconify-icon icon="mdi:eye-off-outline" width={14} class="text-surface-400"
								></iconify-icon>
							{/if}
							<span class="capitalize">{header.label}</span>
						</button>
					</div>
				{/each}
			</section>
		</div>
	</div>
</div>
