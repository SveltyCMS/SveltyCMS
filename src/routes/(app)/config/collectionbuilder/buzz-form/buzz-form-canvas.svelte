<!-- 
@files src/routes/(app)/config/collectionbuilder/BuzzForm/BuzzFormCanvas.svelte
@component
**This component handles the canvas for the BuzzForms**

### Props
- `fields` {any[]} - Array of fields
- `onNodeUpdate` {Function} - Callback function to handle node updates
- `onSelectField` {Function} - Callback function to handle field selection
- `selectedFieldId` {number | string | undefined} - ID of the selected field

### Features
- Drag and drop support for reassigning collections
-->

<script lang="ts">
	import type { DndEvent } from 'svelte-dnd-action';
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';
	import { collection as collections } from '@src/stores/collection-store.svelte';

	interface Props {
		fields: any[];
		onNodeUpdate: (updatedFields: any[]) => void;
		onSelectField: (field: any, index: number) => void;
		selectedFieldId?: number | string;
	}

	let { fields = [], onNodeUpdate, onSelectField, selectedFieldId }: Props = $props();

	// Local list for dndzone so we don't update the store during drag. Updating the store in
	// consider() causes fields to change, re-render, and the dragged node to be replaced —
	// svelte-dnd-action then hits "Cannot read properties of undefined (reading 'parentElement')".
	type Item = { id: number | string; widget?: { key?: string }; [key: string]: unknown };
	let items = $state<Item[]>([]);
	let isDragging = $state(false);

	$effect(() => {
		if (isDragging) return;
		const next: Item[] = (fields || []).map((f: any, i: number) => ({
			id: f.id ?? i + 1,
			...f
		}));
		items = next;
	});

	const flipDurationMs = 200;

	function handleDndConsider(e: CustomEvent<DndEvent<Item>>) {
		isDragging = true;
		items = e.detail.items;
	}

	function handleDndFinalize(e: CustomEvent<DndEvent<Item>>) {
		items = e.detail.items;
		onNodeUpdate(e.detail.items);
		// Defer so store update and parent re-render don't run in the same tick as the library cleanup
		queueMicrotask(() => {
			isDragging = false;
		});
	}
</script>

<div class="flex min-h-0 flex-1 bg-surface-100 dark:bg-surface-900 overflow-y-auto p-4 sm:p-8 lg:p-12 scroll-smooth">
	<div class="mx-auto w-full max-w-3xl">
		<div class="mb-4 sm:mb-8 text-center">
			<h2 class="text-lg sm:text-2xl font-bold opacity-20 uppercase tracking-[0.2em]">{collections.value?.name || 'New Collection'}</h2>
			<div class="mt-2 h-1 w-20 bg-primary-500 mx-auto opacity-30"></div>
		</div>

		<div
			use:dndzone={{ items, flipDurationMs, zoneTabIndex: -1 }}
			onconsider={handleDndConsider}
			onfinalize={handleDndFinalize}
			class="min-h-[300px] sm:min-h-[400px] lg:min-h-[500px] space-y-4 rounded-2xl border-2 border-dashed border-surface-200-800 p-4 sm:p-6 lg:p-8 transition-colors hover:border-primary-500/20"
		>
			{#each items as item, index (item.id)}
				<div animate:flip={{ duration: flipDurationMs }}>
					<button onclick={() => onSelectField(item, index)} class="group relative w-full text-left">
						<!-- Selection Indicator -->
						{#if selectedFieldId === item.id}
							<div class="absolute -left-1 -top-1 -right-1 -bottom-1 rounded-xl border-2 border-primary-500 ring-4 ring-primary-500/10"></div>
						{/if}

						<div
							class="flex items-center gap-4 rounded-xl border border-surface-200-800 bg-white dark:bg-surface-800 p-5 shadow-sm transition-all hover:shadow-md
                                {selectedFieldId === item.id ? 'bg-primary-50/50 dark:bg-primary-900/10' : ''}"
						>
							<div class="cursor-grab p-1 text-surface-400 hover:text-primary-500 active:cursor-grabbing">
								<iconify-icon icon="mdi:drag-vertical" width="24"></iconify-icon>
							</div>

							<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-100 dark:bg-surface-700">
								<iconify-icon icon={item.icon || 'mdi:widgets'} width="28" class="text-primary-500"></iconify-icon>
							</div>

							<div class="flex-1 overflow-hidden">
								<div class="flex items-baseline gap-2">
									<span class="text-lg font-bold">{item.label || 'Unnamed Field'}</span>
									<span class="text-[10px] uppercase tracking-wider text-surface-400 font-mono"> {item.db_fieldName || '-'} </span>
								</div>
								<div class="mt-1 text-xs text-surface-500 line-clamp-1">
									Type: <span class="text-primary-500 font-medium">{item.widget?.key || 'Generic'}</span>
									{#if item.required}
										<span class="ml-2 text-error-500">* Required</span>
									{/if}
								</div>
							</div>

							<div class="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
								<iconify-icon icon="mdi:pencil" width="20" class="text-surface-400"></iconify-icon>
							</div>
						</div>
					</button>
				</div>
			{/each}

			{#if items.length === 0}
				<div class="flex min-h-[280px] sm:min-h-[360px] flex-col items-center justify-center text-surface-400 px-4">
					<div class="relative mb-4 sm:mb-6">
						<iconify-icon icon="fluent:design-ideas-24-regular" width="80" class="opacity-10"></iconify-icon>
						<iconify-icon icon="mdi:plus" width="32" class="absolute -bottom-2 -right-2 text-primary-500 animate-pulse"></iconify-icon>
					</div>
					<p class="text-base sm:text-lg font-medium">Your canvas is empty</p>
					<p class="text-xs sm:text-sm opacity-60 text-center">Drag widgets from the sidebar to start building</p>
				</div>
			{/if}
		</div>
	</div>
</div>
