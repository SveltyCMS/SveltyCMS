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
	import { collection as collections } from '@src/stores/collection-store.svelte';
	import { flip } from 'svelte/animate';
	import type { DndEvent } from 'svelte-dnd-action';
	import { dndzone } from 'svelte-dnd-action';

	interface Props {
		fields: any[];
		onNodeUpdate: (updatedFields: any[]) => void;
		onSelectField: (field: any) => void;
		selectedFieldId?: number | string;
	}

	let { fields = [], onNodeUpdate, onSelectField, selectedFieldId }: Props = $props();

	// Ensure fields have IDs for dndzone
	let items = $derived(
		fields.map((f, i) => ({
			id: f.id || i + 1,
			...f
		}))
	);

	const flipDurationMs = 200;

	function handleDndConsider(e: CustomEvent<DndEvent<typeof items>>) {
		// Just local update during drag
		onNodeUpdate(e.detail.items);
	}

	function handleDndFinalize(e: CustomEvent<DndEvent<typeof items>>) {
		onNodeUpdate(e.detail.items);
	}
</script>

<div class="flex-1 bg-surface-100 dark:bg-surface-900 overflow-y-auto p-12 scroll-smooth">
	<div class="mx-auto max-w-3xl">
		<div class="mb-8 text-center">
			<h2 class="text-2xl font-bold opacity-20 uppercase tracking-[0.2em]">{collections.value?.name || 'New Collection'}</h2>
			<div class="mt-2 h-1 w-20 bg-primary-500 mx-auto opacity-30"></div>
		</div>

		<div
			use:dndzone={{ items, flipDurationMs, zoneTabIndex: -1 }}
			onconsider={handleDndConsider}
			onfinalize={handleDndFinalize}
			class="min-h-[500px] space-y-4 rounded-2xl border-2 border-dashed border-surface-200-800 p-8 transition-colors hover:border-primary-500/20"
		>
			{#each items as item (item.id)}
				<div animate:flip={{ duration: flipDurationMs }}>
					<button onclick={() => onSelectField(item)} class="group relative w-full text-left">
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
				<div class="flex h-full min-h-[400px] flex-col items-center justify-center text-surface-400">
					<div class="relative mb-6">
						<iconify-icon icon="fluent:design-ideas-24-regular" width="80" class="opacity-10"></iconify-icon>
						<iconify-icon icon="mdi:plus" width="32" class="absolute -bottom-2 -right-2 text-primary-500 animate-pulse"></iconify-icon>
					</div>
					<p class="text-lg font-medium">Your canvas is empty</p>
					<p class="text-sm opacity-60">Drag widgets from the sidebar to start building</p>
				</div>
			{/if}
		</div>
	</div>
</div>
