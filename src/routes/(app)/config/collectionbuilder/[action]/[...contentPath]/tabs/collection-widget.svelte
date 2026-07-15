<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget.svelte
@component Collection Widgets — Tab 2: 2-column (left: drag/drop widget list, right: searchable sidebar)
 -->
<script lang="ts">
import { SvelteSet } from "svelte/reactivity";
import type { FieldInstance } from "@src/content/types";
import type { Role } from "@src/databases/auth/types";
import {
	collection,
	setCollection,
	setTargetWidget,
} from "@src/stores/collection-store.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { getWidgetFunction, widgetStoreActions } from "@src/stores/widget-store.svelte.ts";
import { widgets } from "@src/stores/widget-store.svelte.ts";
import { modalState } from "@utils/modal.svelte";
import { getGuiFields } from "@utils/utils";
import { untrack } from "svelte";
import { flip } from "svelte/animate";
import type { DndEvent } from "svelte-dnd-action";
import { dndzone } from "svelte-dnd-action";
import ModalSelectWidget from "./collection-widget/modal-select-widget.svelte";
import ModalWidgetForm from "./collection-widget/modal-widget-form.svelte";
import Button from "@src/components/ui/button.svelte";
import Card from "@src/components/ui/card.svelte";
import FloatingInput from "@components/ui/floating-input.svelte";

type WidgetListItem = FieldInstance & { id: number; _dragId: string };

let { fields = [], roles = [] } = $props<{
	fields: FieldInstance[];
	roles?: Role[];
}>();

// ── Drag and drop state ──
let dragIdsByIndex = $state<Record<number, string>>({});

let items = $state<WidgetListItem[]>(
	untrack(() =>
		(fields ?? []).map((f: FieldInstance, i: number) => {
			const id = (dragIdsByIndex[i] ??= Math.random()
				.toString(36)
				.substring(7));
			return { id: i + 1, ...f, _dragId: id } as WidgetListItem;
		}),
	),
);

// Sync items from props when store updates
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
	if (added) dragIdsByIndex = nextDragIds;
	items = nextFields.map((f: FieldInstance, i: number) => ({
		id: i + 1,
		...f,
		_dragId: nextDragIds[i] ?? Math.random().toString(36).substring(7),
	})) as WidgetListItem[];
});

const flipDurationMs = 200;

function handleDndConsider(_e: CustomEvent<DndEvent<WidgetListItem>>) {}

function handleDndFinalize(e: CustomEvent<DndEvent<WidgetListItem>>) {
	items = e.detail.items;
	dragIdsByIndex = items.reduce(
		(acc, it, i) => {
			acc[i] = it._dragId;
			return acc;
		},
		{} as Record<number, string>,
	);
	updateStore();
}

function updateStore() {
	if (collection.value) {
		const nextFields = items.map(
			({ _dragId, id: _id, ...rest }) => rest as FieldInstance,
		);
		setCollection({ ...collection.value, fields: nextFields });
	}
}

// ── Widget Actions ──
function addField() {
	modalState.trigger(
		ModalSelectWidget as any,
		{
			title: "Add New Field",
			body: "Select a widget type to add to your collection",
		},
		(r: { selectedWidget: string } | undefined) => {
			if (!r) return;
			const widgetInstance = getWidgetFunction(r.selectedWidget);
			if (widgetInstance) {
				const newWidget = {
					widget: { key: r.selectedWidget, Name: r.selectedWidget } as any,
					GuiFields: getGuiFields(
						{ key: r.selectedWidget },
						(widgetInstance.GuiSchema as any),
					),
					permissions: {},
				};
				editField(newWidget);
			}
		},
	);
}

function editField(field: any) {
  // Persist current field to store, then open modal
  const idx = items.findIndex((i: WidgetListItem) => i.id === field.id);
  setTargetWidget({ ...field, __fieldIndex: idx >= 0 ? idx : undefined });

  modalState.trigger(
    ModalWidgetForm as any,
    {
      title: "Edit Field",
      body: "Configure field properties and permissions.",
      value: { ...field, __fieldIndex: idx >= 0 ? idx : undefined },
      roles,
    },
    (r: any) => {
      if (!r) return;
      if (r.__delete) {
        deleteField(field.id);
        return;
      }
      if (r.__duplicate) {
        duplicateField(field);
        return;
      }
      handleInspectorSave(r);
    },
  );
}

function handleInspectorSave(updated: any) {
	const idx = items.findIndex(
		(i: WidgetListItem) => i.id === updated.id || i._dragId === updated._dragId,
	);
	const existingNames = new SvelteSet(
		items.map((i) => i.db_fieldName).filter(Boolean),
	);

	const ensureFieldName = (obj: Record<string, unknown>): string => {
		const name =
			(obj.db_fieldName as string) ||
			(obj.label as string) ||
			(obj.widget as { Name?: string })?.Name ||
			"field";
		const base =
			String(name)
				.trim()
				.replace(/\s+/g, "_")
				.replace(/[^a-zA-Z0-9_]/g, "") || "field";
		let candidate = base;
		let n = 0;
		if (idx !== -1 && items[idx].db_fieldName === candidate) return candidate;
		while (existingNames.has(candidate)) candidate = `${base}_${++n}`;
		existingNames.add(candidate);
		return candidate;
	};

	const normalized = {
		...updated,
		db_fieldName: updated.db_fieldName || ensureFieldName(updated),
	};

	if (idx !== -1) {
		items = items.map((item, i) =>
			i === idx ? ({ ...item, ...normalized } as WidgetListItem) : item,
		);
	} else {
		const newIndex = items.length;
		const newDragId = Math.random().toString(36).substring(7);
		dragIdsByIndex = { ...dragIdsByIndex, [newIndex]: newDragId };
		items = [
			...items,
			{ id: newIndex + 1, _dragId: newDragId, ...normalized } as WidgetListItem,
		];
	}
	updateStore();
}

function deleteField(id: number) {
	items = items
		.filter((i: WidgetListItem) => i.id !== id)
		.map((item, idx) => ({ ...item, id: idx + 1 }));
	dragIdsByIndex = items.reduce(
		(acc, it, i) => {
			acc[i] = it._dragId;
			return acc;
		},
		{} as Record<number, string>,
	);
	updateStore();
	toast.info("Field removed");
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
		db_fieldName: field.db_fieldName
			? `${field.db_fieldName}_copy`
			: field.db_fieldName,
	} as WidgetListItem;
	items = [...items, newField];
	updateStore();
	toast.success("Field duplicated");
}

async function addSidebarWidget(key: string) {
	await widgetStoreActions.initializeWidgets();
	const widgetInstance = getWidgetFunction(key);
	if (widgetInstance) {
		const newIndex = items.length;
		const newDragId = Math.random().toString(36).substring(7);
		dragIdsByIndex = { ...dragIdsByIndex, [newIndex]: newDragId };
		const newWidget = {
			label: `New ${key}`,
			db_fieldName: `new_${key.toLowerCase()}`,
			widget: { key, Name: key } as any,
			icon: (widgetInstance as any).Icon || "mdi:widgets",
			GuiFields: getGuiFields({ key }, (widgetInstance.GuiSchema as any)),
			permissions: {},
		};
		items = [
			...items,
			{
				id: newIndex + 1,
				_dragId: newDragId,
				...newWidget,
			} as unknown as WidgetListItem,
		];
		updateStore();
		toast.success(`Added ${key} field`);
	}
}

// ── Sidebar State ──
let sidebarSearch = $state("");

const availableWidgets = $derived(widgets.widgetFunctions || {});

// Organize widgets into categories
const coreWidgets = $derived(
	(widgets.coreWidgets || [])
		.filter((key: string) =>
			!sidebarSearch || key.toLowerCase().includes(sidebarSearch.toLowerCase())
		)
		.map((key: string) => ({
			key,
			label: key,
			icon: (availableWidgets[key] as any)?.Icon || "mdi:puzzle",
			description: (availableWidgets[key] as any)?.Description || "",
		}))
);

const customWidgets = $derived(
	(widgets.customWidgets || [])
		.filter((key: string) =>
			!sidebarSearch || key.toLowerCase().includes(sidebarSearch.toLowerCase())
		)
		.map((key: string) => ({
			key,
			label: key,
			icon: (availableWidgets[key] as any)?.Icon || "mdi:puzzle",
			description: (availableWidgets[key] as any)?.Description || "",
		}))
);

const marketplaceWidgets = $derived(
	(widgets.marketplaceWidgets || [])
		.filter((key: string) =>
			!sidebarSearch || key.toLowerCase().includes(sidebarSearch.toLowerCase())
		)
		.map((key: string) => ({
			key,
			label: key,
			icon: (availableWidgets[key] as any)?.Icon || "mdi:store",
			description: (availableWidgets[key] as any)?.Description || "",
		}))
);
</script>

<div class="flex h-full gap-0">
	<!-- ═══ LEFT COLUMN: Widget Canvas / Drag-and-drop List ═══ -->
	<div class="flex-1 min-w-0 flex flex-col border-r border-surface-200 dark:border-surface-700">

		<!-- Quick Add Bar -->
		<div class="shrink-0 p-4 border-b border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900">
			<div class="flex items-center gap-3">
				<div class="flex items-center gap-2 text-sm font-semibold text-surface-700 dark:text-surface-300">
					<iconify-icon icon="mdi:widgets" width="20" class="text-primary-500"></iconify-icon>
					<span>{items.length} {items.length === 1 ? 'Widget' : 'Widgets'}</span>
				</div>
				<div class="flex-1"></div>
				<Button
					variant="primary"
					size="sm"
					onclick={addField}
					leadingIcon="mdi:plus"
					data-testid="add-field-button"
				>
					Add Widget
				</Button>
			</div>
		</div>

		<!-- Drag-and-drop Widget List -->
		<div class="flex-1 overflow-y-auto min-h-0 p-4">
			<div
				use:dndzone={{ items, flipDurationMs, zoneTabIndex: -1 }}
				onconsider={handleDndConsider}
				onfinalize={handleDndFinalize}
				class="space-y-3 min-h-50"
				data-testid="widget-fields-list"
			>
				{#each items as item (item._dragId)}
					<div animate:flip={{ duration: flipDurationMs }} class="group relative">
						<Card class="flex items-center gap-4 p-3 pe-4 transition-all hover:border-primary-500 hover:shadow-lg hover:shadow-primary-500/5 bg-white dark:bg-surface-800">
							<!-- Drag Handle -->
							<div class="cursor-grab text-surface-300 active:cursor-grabbing group-hover:text-primary-500 transition-colors">
								<iconify-icon icon="mdi:drag-vertical" width="24"></iconify-icon>
							</div>

							<!-- Field Icon -->
							<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface-100 dark:bg-surface-900 border border-surface-200 dark:border-surface-700">
								<iconify-icon icon={item.icon || (item.widget as any)?.key ? (availableWidgets[(item.widget as any)?.key] as any)?.Icon || 'mdi:widgets' : 'mdi:widgets'} width="20" class="text-primary-500"></iconify-icon>
							</div>

							<!-- Field Info -->
							<div class="flex-1 min-w-0 pe-4">
								<div class="flex items-center gap-2 mb-0.5">
									<span class="font-bold truncate text-sm sm:text-base">{item.label || 'Unnamed Field'}</span>
									<span class="px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider uppercase bg-surface-200 dark:bg-surface-700 text-surface-600 dark:text-surface-400">
										{(item.widget as { key?: string })?.key || 'Generic'}
									</span>
								</div>
								<div class="flex items-center gap-3">
									<code class="text-[10px] text-surface-400 dark:text-surface-50 bg-surface-100 dark:bg-surface-900 px-1 rounded truncate">
										{item.db_fieldName || 'unnamed_field'}
									</code>
									{#if item.required}
										<span class="text-[9px] font-bold text-error-500 flex items-center gap-0.5">
											<iconify-icon icon="mdi:asterisk" width="8"></iconify-icon> Required
										</span>
									{/if}
								</div>
							</div>

							<!-- Actions -->
							<div class="flex gap-1.5 items-center">
								<Button variant="ghost" size="sm" onclick={() => editField(item)} title="Edit">
									<iconify-icon icon="mdi:pencil" width="18"></iconify-icon>
								</Button>
								<Button variant="ghost" size="sm" onclick={() => duplicateField(item)} title="Duplicate">
									<iconify-icon icon="mdi:content-copy" width="18"></iconify-icon>
								</Button>
								<Button variant="ghost" size="sm" onclick={() => deleteField(item.id)} class="text-error-500 hover:bg-error-500/10" title="Remove">
									<iconify-icon icon="mdi:trash-can" width="18"></iconify-icon>
								</Button>
							</div>
						</Card>
					</div>
				{/each}

				{#if items.length === 0}
					<div class="flex h-48 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-surface-200 dark:border-surface-700 bg-surface-50/30 dark:bg-surface-900/10 text-surface-400 dark:text-surface-50">
						<iconify-icon icon="mdi:widgets-outline" width="48" class="mb-3 opacity-20"></iconify-icon>
						<p class="text-sm font-medium">Add your first widget to start building</p>
						<p class="mt-1 text-xs opacity-60">Click a widget from the sidebar or use the Add Widget button</p>
					</div>
				{/if}
			</div>
		</div>
	</div>

	<!-- ═══ RIGHT COLUMN: Widget Sidebar ═══ -->
	<div class="w-72 lg:w-80 shrink-0 flex flex-col bg-surface-50/50 dark:bg-surface-900/50 border-l border-surface-200 dark:border-surface-700">

		<!-- Sidebar Header & Search -->
		<div class="shrink-0 p-4 border-b border-surface-200 dark:border-surface-700">
			<h3 class="text-sm font-bold text-surface-500 dark:text-surface-400 uppercase tracking-wider mb-3 flex items-center gap-2">
				<iconify-icon icon="mdi:view-grid-plus-outline" width="16"></iconify-icon>
				Available Widgets
			</h3>
			<FloatingInput
				bind:value={sidebarSearch}
				label="Search widgets..."
				icon="mdi:magnify"
				aria-label="Search widgets"
				inputClass="h-9 text-sm rounded"
			/>
		</div>

		<!-- Widget Categories -->
		<div class="flex-1 overflow-y-auto min-h-0 p-3 space-y-5">
			<!-- Core Widgets -->
			{#if coreWidgets.length > 0}
				<div>
					<h4 class="mb-2 text-[10px] font-bold uppercase tracking-widest text-surface-400 px-1">Core</h4>
					<div class="grid grid-cols-2 gap-2">
						{#each coreWidgets as w (w.key)}
							<button
								onclick={() => addSidebarWidget(w.key)}
								class="group flex flex-col items-center justify-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-3 transition-all hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 text-start"
							>
								<div class="flex h-9 w-9 items-center justify-center rounded bg-surface-100 dark:bg-surface-700 text-surface-500 group-hover:bg-primary-500 group-hover:text-white transition-colors">
									<iconify-icon icon={w.icon} width="20"></iconify-icon>
								</div>
								<div class="text-center">
									<span class="text-[11px] font-semibold text-surface-700 dark:text-surface-300 block leading-tight">{w.label}</span>
									{#if w.description}
										<span class="text-[9px] text-surface-400 dark:text-surface-500 line-clamp-1">{w.description}</span>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Custom Widgets -->
			{#if customWidgets.length > 0}
				<div>
					<h4 class="mb-2 text-[10px] font-bold uppercase tracking-widest text-surface-400 px-1">Custom</h4>
					<div class="grid grid-cols-2 gap-2">
						{#each customWidgets as w (w.key)}
							<button
								onclick={() => addSidebarWidget(w.key)}
								class="group flex flex-col items-center justify-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-3 transition-all hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 text-start"
							>
								<div class="flex h-9 w-9 items-center justify-center rounded bg-surface-100 dark:bg-surface-700 text-surface-500 group-hover:bg-primary-500 group-hover:text-white transition-colors">
									<iconify-icon icon={w.icon} width="20"></iconify-icon>
								</div>
								<div class="text-center">
									<span class="text-[11px] font-semibold text-surface-700 dark:text-surface-300 block leading-tight">{w.label}</span>
									{#if w.description}
										<span class="text-[9px] text-surface-400 dark:text-surface-500 line-clamp-1">{w.description}</span>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Marketplace Widgets -->
			{#if marketplaceWidgets.length > 0}
				<div>
					<h4 class="mb-2 text-[10px] font-bold uppercase tracking-widest text-surface-400 px-1">Marketplace</h4>
					<div class="grid grid-cols-2 gap-2">
						{#each marketplaceWidgets as w (w.key)}
							<button
								onclick={() => addSidebarWidget(w.key)}
								class="group flex flex-col items-center justify-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-3 transition-all hover:border-warning-500 hover:bg-warning-50 dark:hover:bg-warning-900/20 text-start"
							>
								<div class="flex h-9 w-9 items-center justify-center rounded bg-surface-100 dark:bg-surface-700 text-warning-500 group-hover:bg-warning-500 group-hover:text-white transition-colors">
									<iconify-icon icon={w.icon} width="20"></iconify-icon>
								</div>
								<div class="text-center">
									<span class="text-[11px] font-semibold text-surface-700 dark:text-surface-300 block leading-tight">{w.label}</span>
									{#if w.description}
										<span class="text-[9px] text-surface-400 dark:text-surface-500 line-clamp-1">{w.description}</span>
									{/if}
								</div>
							</button>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Marketplace Link -->
		<div class="shrink-0 p-3 border-t border-surface-200 dark:border-surface-700">
			<a
				href="/config/extension"
				class="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-warning-300 dark:border-warning-700 bg-warning-50 dark:bg-warning-900/20 p-3 text-sm font-semibold text-warning-600 dark:text-warning-400 hover:bg-warning-100 dark:hover:bg-warning-900/40 transition-colors"
			>
				<iconify-icon icon="mdi:store-outline" width="18"></iconify-icon>
				Browse Marketplace
				<iconify-icon icon="mdi:arrow-right" width="16"></iconify-icon>
			</a>
		</div>
	</div>


</div>
