<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/CollectionWidgetOptimized.svelte
@component
**This Component handles the optimized collection widget**
-->
<script lang="ts">
	import type { FieldInstance } from '@src/content/types';
	import { collection, setTargetWidget } from '@src/stores/collectionStore.svelte';
	import { toaster } from '@src/stores/store.svelte';
	import { widgetFunctions } from '@stores/widgetStore.svelte.ts';
	import { modalState } from '@utils/modalState.svelte';
	import { asAny, getGuiFields } from '@utils/utils';
	import { untrack } from 'svelte';
	import { flip } from 'svelte/animate';
	import { get } from 'svelte/store';
	import { type DndEvent, dndzone } from 'svelte-dnd-action';
	import ModalSelectWidget from './CollectionWidget/ModalSelectWidget.svelte';
	import ModalWidgetForm from './CollectionWidget/ModalWidgetForm.svelte';

	let { fields = [] } = $props<{ fields: FieldInstance[] }>();

	let items = $state(
		untrack(() =>
			fields.map((f: FieldInstance, i: number) => ({
				id: i + 1,
				...f,
				_dragId: Math.random().toString(36).substring(7)
			}))
		)
	);

	const flipDurationMs = 200;

	function handleDndConsider(e: CustomEvent<DndEvent<typeof items>>) {
		items = e.detail.items;
	}

	function handleDndFinalize(e: CustomEvent<DndEvent<typeof items>>) {
		items = e.detail.items;
		updateStore();
	}

	function updateStore() {
		if (collection.value) {
			collection.value.fields = items.map(
				({ _dragId, id: _id, ...rest }: { _dragId?: string; id?: number; [key: string]: any }) => rest as FieldInstance
			);
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
				if (!r) return;
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
		setTargetWidget(field);
		modalState.trigger(
			ModalWidgetForm as any,
			{
				title: field.id ? 'Edit Field' : 'New Field',
				value: field
			},
			(r: { id?: number; [key: string]: any } | undefined) => {
				if (!r) return;
				const idx = items.findIndex((i: (typeof items)[number]) => i.id === r.id);
				if (idx !== -1) {
					items[idx] = { ...items[idx], ...r };
				} else {
					items.push({
						id: items.length + 1,
						_dragId: Math.random().toString(36).substring(7),
						...r
					});
				}
				updateStore();
			}
		);
	}

	function deleteField(id: number) {
		items = items.filter((i: (typeof items)[number]) => i.id !== id).map((item: (typeof items)[number], idx: number) => ({ ...item, id: idx + 1 }));
		updateStore();
		toaster.info({ description: 'Field removed from collection' });
	}

	function duplicateField(field: (typeof items)[number]) {
		const newField = {
			...field,
			id: items.length + 1,
			_dragId: Math.random().toString(36).substring(7),
			label: `${field.label} (Copy)`,
			db_fieldName: field.db_fieldName ? `${field.db_fieldName}_copy` : undefined
		};
		items.push(newField);
		updateStore();
	}

	import BuzzForm from '@src/routes/(app)/config/collectionbuilder/BuzzForm/BuzzForm.svelte';

	let builderView = $state<'list' | 'buzz'>('buzz');

	const quickWidgets = [
		{ key: 'Text', icon: 'material-symbols:text-fields', label: 'Short Text' },
		{ key: 'RichText', icon: 'material-symbols:format-list-bulleted-rounded', label: 'Rich Text' },
		{ key: 'Image', icon: 'material-symbols:image-outline', label: 'Image' },
		{ key: 'Relation', icon: 'material-symbols:account-tree-outline', label: 'Relation' }
	];

	function addQuickWidget(key: string) {
		const widgetInstance = get(widgetFunctions)[key];
		if (widgetInstance) {
			const newWidget = {
				label: `New ${key}`,
				db_fieldName: `new_${key.toLowerCase()}`,
				widget: { key, Name: key } as any,
				GuiFields: getGuiFields({ key }, asAny(widgetInstance.GuiSchema)),
				permissions: {}
			};
			items.push({
				id: items.length + 1,
				_dragId: Math.random().toString(36).substring(7),
				...newWidget
			});
			updateStore();
			toaster.success({ description: `Added ${key} field` });
		}
	}
</script>

<div class="space-y-6">
	<!-- View Toggle -->
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-1 rounded-lg bg-surface-100-900 p-1 shadow-inner border border-surface-200-800">
			<button
				onclick={() => (builderView = 'buzz')}
				class="btn btn-sm flex items-center gap-2 px-4 py-1.5 transition-all
					{builderView === 'buzz' ? 'preset-filled-primary-500 shadow-sm' : 'text-surface-500 hover:text-surface-700'}"
			>
				<iconify-icon icon="fluent:design-ideas-24-filled" width="18"></iconify-icon>
				<span>BuzzForm</span>
			</button>
			<button
				onclick={() => (builderView = 'list')}
				class="btn btn-sm flex items-center gap-2 px-4 py-1.5 transition-all
					{builderView === 'list' ? 'preset-filled-primary-500 shadow-sm' : 'text-surface-500 hover:text-surface-700'}"
			>
				<iconify-icon icon="mdi:format-list-bulleted" width="18"></iconify-icon>
				<span>Standard List</span>
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
					class="preset-outlined-surface-500 btn flex items-center gap-1 text-xs hover:preset-filled-primary-500"
				>
					<iconify-icon icon={qw.icon} width="16"></iconify-icon>
					{qw.label}
				</button>
			{/each}
			<button onclick={addField} class="preset-filled-secondary-500 btn flex items-center gap-1 text-xs sm:ml-auto">
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
								<span class="rounded bg-surface-300-700 px-1 py-0.5 text-[10px] uppercase"> {item.widget?.key || 'Generic'} </span>
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
