<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/CollectionWidgetOptimized.svelte
@component
**This Component handles the optimized collection widget**
-->
<script lang="ts">
	import type { FieldInstance } from '@src/content/types';
	import { collection, setCollection, setTargetWidget } from '@src/stores/collection-store.svelte';
	import { toaster } from '@src/stores/store.svelte';
	import { widgetFunctions } from '@src/stores/widget-store.svelte.ts';
	import { modalState } from '@utils/modal-state.svelte';
	import { asAny, getGuiFields } from '@utils/utils';
	import { untrack } from 'svelte';
	import { get } from 'svelte/store';
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';
	import type { DndEvent } from 'svelte-dnd-action';
	import ModalSelectWidget from './collection-widget/modal-select-widget.svelte';
	import ModalWidgetForm from './collection-widget/modal-widget-form.svelte';
	import BuzzForm from '@src/routes/(app)/config/collectionbuilder/buzz-form/buzz-form.svelte';

	type WidgetListItem = FieldInstance & { id: number; _dragId: string };

	let { fields = [] } = $props<{ fields: FieldInstance[] }>();

	// Stable _dragId by index so we can sync items from props without losing drag identity
	let dragIdsByIndex = $state<Record<number, string>>({});

	let items = $state<WidgetListItem[]>(
		untrack(() =>
			(fields ?? []).map((f: FieldInstance, i: number) => {
				const id = (dragIdsByIndex[i] ??= Math.random().toString(36).substring(7));
				return { id: i + 1, ...f, _dragId: id } as WidgetListItem;
			})
		)
	);

	// Sync items from props when store updates (e.g. after save) so list and inspector show saved data
	$effect(() => {
		const nextFields = fields ?? [];
		const nextDragIds = { ...dragIdsByIndex };
		let added = false;
		for (let i = 0; i < nextFields.length; i++) {
			if (nextDragIds[i] === undefined) {
				nextDragIds[i] = Math.random().toString(36).substring(7);
				added = true;
			}
		}
		if (added) {
			dragIdsByIndex = nextDragIds;
		}
		items = nextFields.map((f: FieldInstance, i: number) => ({
			id: i + 1,
			...f,
			_dragId: nextDragIds[i] ?? Math.random().toString(36).substring(7)
		})) as WidgetListItem[];
	});

	const flipDurationMs = 200;

	function handleDndConsider(_e: CustomEvent<DndEvent<WidgetListItem>>) {
		// Do not update items during consider — re-render removes the dragged node from DOM
		// and svelte-dnd-action throws "Cannot read properties of undefined (reading 'parentElement')".
		// Only update on finalize.
	}

	function handleDndFinalize(e: CustomEvent<DndEvent<WidgetListItem>>) {
		items = e.detail.items;
		dragIdsByIndex = items.reduce((acc, it, i) => ({ ...acc, [i]: it._dragId }), {});
		updateStore();
	}

	function updateStore() {
		if (collection.value) {
			const nextFields = items.map(({ _dragId, id: _id, ...rest }: { _dragId?: string; id?: number; [key: string]: any }) => rest as FieldInstance);
			setCollection({ ...collection.value, fields: nextFields });
		}
	}

	function addField() {
		modalState.trigger(
			ModalSelectWidget as any,
			{
				title: 'Add Field',
				body: 'Select a widget type to add to your collection'
			},
			(r: { selectedWidget: string } | undefined) => {
				if (!r) {
					return;
				}
				const widgetInstance = get(widgetFunctions)[r.selectedWidget];
				if (widgetInstance) {
					const newWidget = {
						widget: { key: r.selectedWidget, Name: r.selectedWidget } as any,
						GuiFields: getGuiFields({ key: r.selectedWidget }, asAny(widgetInstance.GuiSchema)),
						permissions: {}
					};
					editField(newWidget);
				}
			}
		);
	}

	function editField(field: any) {
		const idx = items.findIndex((i: WidgetListItem) => i.id === field.id);
		setTargetWidget({ ...field, __fieldIndex: idx >= 0 ? idx : undefined });
		modalState.trigger(
			ModalWidgetForm as any,
			{
				title: field.id ? 'Edit Field' : 'New Field',
				value: field
			},
			(r: { id?: number; [key: string]: any } | undefined) => {
				if (!r) {
					return;
				}
				const idx = items.findIndex((i: WidgetListItem) => i.id === r.id);
				if (idx !== -1) {
					items = items.map((item, i) => (i === idx ? ({ ...item, ...r } as WidgetListItem) : item));
				} else {
					const newIndex = items.length;
					const newDragId = Math.random().toString(36).substring(7);
					dragIdsByIndex = { ...dragIdsByIndex, [newIndex]: newDragId };
					items = [...items, { id: newIndex + 1, _dragId: newDragId, ...r } as WidgetListItem];
				}
				updateStore();
				// Refresh inspector so right panel shows saved field (label, db_fieldName, required, icon) without reload
				const updatedIndex = idx !== -1 ? idx : items.length - 1;
				const updated = items[updatedIndex];
				if (updated) {
					setTargetWidget({
						...updated,
						__fieldIndex: updatedIndex,
						permissions: updated.permissions ?? {}
					});
				}
			}
		);
	}

	function deleteField(id: number) {
		items = items
			.filter((i: WidgetListItem) => i.id !== id)
			.map((item: WidgetListItem, idx: number) => ({
				...item,
				id: idx + 1
			}));
		dragIdsByIndex = items.reduce((acc, it, i) => ({ ...acc, [i]: it._dragId }), {});
		updateStore();
		toaster.info({ description: 'Field removed from collection' });
	}

	function duplicateField(field: WidgetListItem) {
		const newIndex = items.length;
		const newDragId = Math.random().toString(36).substring(7);
		dragIdsByIndex = { ...dragIdsByIndex, [newIndex]: newDragId };
		const newField = {
			...field,
			id: newIndex + 1,
			_dragId: newDragId,
			label: `${field.label} (Copy)`,
			db_fieldName: field.db_fieldName ? `${field.db_fieldName}_copy` : field.db_fieldName
		} as WidgetListItem;
		items = [...items, newField];
		updateStore();
	}

	let builderView = $state<'list' | 'buzz'>('buzz');

	const quickWidgets = [
		{ key: 'Text', icon: 'material-symbols:text-fields', label: 'Short Text' },
		{
			key: 'RichText',
			icon: 'material-symbols:format-list-bulleted-rounded',
			label: 'Rich Text'
		},
		{ key: 'Image', icon: 'material-symbols:image-outline', label: 'Image' },
		{
			key: 'Relation',
			icon: 'material-symbols:account-tree-outline',
			label: 'Relation'
		}
	];

	function addQuickWidget(key: string) {
		const widgetInstance = get(widgetFunctions)[key];
		if (widgetInstance) {
			const newIndex = items.length;
			const newDragId = Math.random().toString(36).substring(7);
			dragIdsByIndex = { ...dragIdsByIndex, [newIndex]: newDragId };
			const newWidget = {
				label: `New ${key}`,
				db_fieldName: `new_${key.toLowerCase()}`,
				widget: { key, Name: key } as any,
				GuiFields: getGuiFields({ key }, asAny(widgetInstance.GuiSchema)),
				permissions: {}
			};
			items = [...items, { id: newIndex + 1, _dragId: newDragId, ...newWidget } as unknown as WidgetListItem];
			updateStore();
			toaster.success({ description: `Added ${key} field` });
		}
	}
</script>

<div class="space-y-4 sm:space-y-6">
	<!-- View Toggle + fields count -->
	<div class="flex flex-wrap items-center justify-between gap-3">
		<div class="flex items-center gap-1 rounded-lg bg-surface-100-900 p-1 shadow-inner border border-surface-200-800">
			<button
				onclick={() => (builderView = 'buzz')}
				class="btn btn-sm flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 transition-all min-h-[2.5rem] touch-manipulation
					{builderView === 'buzz' ? 'preset-filled-primary-500 shadow-sm' : 'text-surface-500 hover:text-surface-700'}"
			>
				<iconify-icon icon="fluent:design-ideas-24-filled" width="18"></iconify-icon>
				<span class="text-sm sm:text-base">BuzzForm</span>
			</button>
			<button
				onclick={() => (builderView = 'list')}
				class="btn btn-sm flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 transition-all min-h-[2.5rem] touch-manipulation
					{builderView === 'list' ? 'preset-filled-primary-500 shadow-sm' : 'text-surface-500 hover:text-surface-700'}"
			>
				<iconify-icon icon="mdi:format-list-bulleted" width="18"></iconify-icon>
				<span class="text-sm sm:text-base">Standard List</span>
			</button>
		</div>
	</div>

	{#if builderView === 'buzz'}
		<BuzzForm />
	{:else}
		<!-- Quick Add Bar -->
		<div class="flex flex-wrap gap-2">
			{#each quickWidgets as qw (qw.key)}
				<button
					onclick={() => addQuickWidget(qw.key)}
					class="preset-outlined-surface-500 btn flex items-center gap-1 text-xs hover:preset-filled-primary-500 min-h-[2.25rem] touch-manipulation"
				>
					<iconify-icon icon={qw.icon} width="16"></iconify-icon>
					{qw.label}
				</button>
			{/each}
			<button
				onclick={addField}
				class="preset-filled-secondary-500 btn flex items-center gap-1 text-xs min-h-[2.25rem] touch-manipulation w-full sm:w-auto sm:ml-auto"
			>
				<iconify-icon icon="mdi:plus" width="16"></iconify-icon>
				More Widgets
			</button>
		</div>

		<!-- Fields List -->
		<div
			use:dndzone={{ items, flipDurationMs, zoneTabIndex: -1 }}
			onconsider={handleDndConsider}
			onfinalize={handleDndFinalize}
			class="min-h-[200px] space-y-3"
		>
			{#each items as item (item.id)}
				<div animate:flip={{ duration: flipDurationMs }} class="group relative">
					<div
						class="flex items-center gap-4 rounded-lg border border-surface-200-800 bg-surface-100-900 p-3 shadow-sm transition-all hover:border-primary-500/50 hover:bg-surface-200-800"
					>
						<!-- Drag Handle -->
						<div class="cursor-grab text-surface-400 active:cursor-grabbing group-hover:text-primary-500">
							<iconify-icon icon="mdi:drag-vertical" width="24"></iconify-icon>
						</div>

						<!-- Field Icon & Number -->
						<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-200-800 text-sm font-bold">{item.id}</div>

						<!-- Field Info -->
						<div class="flex-1 overflow-hidden">
							<div class="flex items-center gap-2">
								<iconify-icon icon={item.icon || 'mdi:widgets'} width="18" class="text-primary-500"></iconify-icon>
								<span class="truncate font-bold">{item.label}</span>
							</div>
							<div class="flex items-center gap-3 text-xs text-surface-500">
								<span class="font-mono">{item.db_fieldName || '-'}</span>
								<span class="rounded bg-surface-300-700 px-1 py-0.5 text-[10px] uppercase">
									{(item.widget as { key?: string })?.key || 'Generic'}
								</span>
							</div>
						</div>

						<!-- Actions -->
						<div class="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
							<button onclick={() => duplicateField(item)} class="preset-ghost-surface-500 btn-icon" title="Duplicate">
								<iconify-icon icon="mdi:content-copy" width="18"></iconify-icon>
							</button>
							<button onclick={() => editField(item)} class="preset-ghost-primary-500 btn-icon" title="Edit">
								<iconify-icon icon="mdi:pencil" width="18"></iconify-icon>
							</button>
							<button onclick={() => deleteField(item.id)} class="preset-ghost-error-500 btn-icon" title="Delete">
								<iconify-icon icon="mdi:trash-can" width="18"></iconify-icon>
							</button>
						</div>
					</div>
				</div>
			{/each}

			{#if items.length === 0}
				<div class="flex h-32 flex-col items-center justify-center rounded-xl border-2 border-dashed border-surface-200-800 text-surface-500">
					<iconify-icon icon="mdi:widgets-outline" width="48" class="mb-2 opacity-20"></iconify-icon>
					<p>No fields defined yet. Use the buttons above to start building.</p>
				</div>
			{/if}
		</div>
	{/if}
</div>
