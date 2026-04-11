<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/CollectionWidgetOptimized.svelte
@component
**This Component handles the optimized collection widget**
-->
<script lang="ts">
import { SvelteSet } from "svelte/reactivity";
import type { FieldInstance } from "@src/content/types";
import type { Role } from "@src/databases/auth/types";
import BuzzForm from "@src/routes/(app)/config/collectionbuilder/buzz-form/buzz-form.svelte";
import {
	collection,
	setCollection,
	setTargetWidget,
	targetWidget,
} from "@src/stores/collection-store.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { widgetFunctions } from "@src/stores/widget-store.svelte.ts";
import { sveltyRegistry } from "@src/services/json-render/catalog";
import { Renderer, JSONUIProvider, type Spec } from "json-render-svelte";
import { modalState } from "@utils/modal-state.svelte";
import { asAny, getGuiFields } from "@utils/utils";
import { untrack } from "svelte";
import { flip } from "svelte/animate";
import { get } from "svelte/store";
import type { DndEvent } from "svelte-dnd-action";
import { dndzone } from "svelte-dnd-action";
import ModalSelectWidget from "./collection-widget/modal-select-widget.svelte";
import WidgetInspector from "./collection-widget/widget-inspector.svelte";
import Button from "@src/components/ui/button.svelte";
import Card from "@src/components/ui/card.svelte";
import SegmentedControl from "@src/components/ui/segmented-control.svelte";

type WidgetListItem = FieldInstance & { id: number; _dragId: string };

let { fields = [], roles = [] } = $props<{
	fields: FieldInstance[];
	roles?: Role[];
}>();

// Stable _dragId by index so we can sync items from props without losing drag identity
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
			({
				_dragId,
				id: _id,
				...rest
			}: {
				_dragId?: string;
				id?: number;
				[key: string]: any;
			}) => rest as FieldInstance,
		);
		setCollection({ ...collection.value, fields: nextFields });
	}
}

function addField() {
	modalState.trigger(
		ModalSelectWidget as any,
		{
			title: "Add New Field",
			body: "Select a widget type to add to your collection",
		},
		(r: { selectedWidget: string } | undefined) => {
			if (!r) return;
			const widgetInstance = get(widgetFunctions)[r.selectedWidget];
			if (widgetInstance) {
				const newWidget = {
					widget: { key: r.selectedWidget, Name: r.selectedWidget } as any,
					GuiFields: getGuiFields(
						{ key: r.selectedWidget },
						asAny(widgetInstance.GuiSchema),
					),
					permissions: {},
				};
				editField(newWidget);
			}
		},
	);
}

function editField(field: any) {
	const idx = items.findIndex((i: WidgetListItem) => i.id === field.id);
	setTargetWidget({ ...field, __fieldIndex: idx >= 0 ? idx : undefined });
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
		// If editing, don't count itself as conflict
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

let builderView = $state<"list" | "buzz" | "preview">("list");
let mockData = $state<Record<string, any>>({});

function generatePreviewSpec(fieldsToRender: FieldInstance[]): Spec {
	const elements: Record<string, any> = {
		root: {
			type: "VerticalLayout",
			elements: fieldsToRender.map((f) => f.db_fieldName || f.label),
		},
	};
	fieldsToRender.forEach((field) => {
		const widgetName = field.widget?.Name || "Text";
		const id = field.db_fieldName || field.label;
		elements[id] = {
			type: "Control",
			scope: `#/properties/${id}`,
			label: field.label,
			options: { widget: widgetName, ...(field.GuiFields as any) },
		};
	});
	return { root: "root", elements } as unknown as Spec;
}

const quickWidgets = [
	{ key: "Text", icon: "material-symbols:text-fields", label: "Short Text" },
	{
		key: "RichText",
		icon: "material-symbols:format-list-bulleted-rounded",
		label: "Rich Text",
	},
	{ key: "Image", icon: "material-symbols:image-outline", label: "Image" },
	{
		key: "Relation",
		icon: "material-symbols:account-tree-outline",
		label: "Relation",
	},
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

const viewOptions = [
	{ value: "list", label: "Standard List", icon: "mdi:format-list-bulleted" },
	{ value: "buzz", label: "BuzzForm", icon: "fluent:design-ideas-24-filled" },
	{ value: "preview", label: "Live Preview", icon: "mdi:eye" },
];
</script>

<div class="flex-1 min-h-0 flex gap-6">
	<!-- Left Side: View Toggle & List -->
	<div class="flex-1 flex flex-col gap-6 min-w-0">
		<div class="flex items-center justify-between gap-4">
		<SegmentedControl 
			options={viewOptions} 
			bind:value={builderView} 
			class="max-w-md"
		/>
		<div class="text-xs font-medium text-surface-500 dark:text-surface-50 bg-surface-100 dark:bg-surface-800 px-3 py-1 rounded-full border border-surface-200 dark:border-surface-700">
			{items.length} Fields
		</div>
	</div>

	<div class="flex-1 overflow-y-auto min-h-0 pr-1">
		{#if builderView === 'buzz'}
			<BuzzForm />
		{:else if builderView === 'preview'}
			<div class="space-y-6">
				<Card class="p-6 border-t-4 border-t-primary-500">
					<h3 class="text-lg font-bold text-primary-500 flex items-center gap-2 mb-2">
						<iconify-icon icon="mdi:magic-staff"></iconify-icon>
						Live UI Preview
					</h3>
					<p class="text-sm text-surface-500 dark:text-surface-50 mb-6">
						Experience the exact layout rendered by our AI-Native engine. Perfect parity between builder and live CMS.
					</p>

					<div class="max-w-3xl border border-surface-200 dark:border-surface-700 rounded-xl p-8 bg-surface-50 dark:bg-surface-900 shadow-inner">
						{#key items}
							<JSONUIProvider initialState={mockData}>
								<Renderer registry={sveltyRegistry} spec={generatePreviewSpec(items)} />
							</JSONUIProvider>
						{/key}
					</div>
				</Card>

				<Card class="p-4 bg-surface-900 overflow-hidden">
					<h4 class="text-[10px] font-bold uppercase text-surface-400 mb-2 px-2">Live Store Data</h4>
					<pre class="text-[11px] text-primary-300 overflow-auto max-h-40 font-mono scrollbar-hide">{JSON.stringify(mockData, null, 2)}</pre>
				</Card>
			</div>
		{:else}
			<div class="space-y-6">
				<!-- Add Bar -->
				<Card class="p-4 flex flex-wrap items-center gap-2 bg-surface-50/50 dark:bg-surface-900/50 border-dashed">
					<span class="text-xs font-bold text-surface-500 dark:text-surface-50 mr-2 uppercase tracking-tight">Quick Add:</span>
					{#each quickWidgets as qw}
						<Button 
							variant="outline" 
							size="sm" 
							onclick={() => addQuickWidget(qw.key)}
							leadingIcon={qw.icon}
							class="text-[11px] h-8"
						>
							{qw.label}
						</Button>
					{/each}
					<Button 
						variant="primary" 
						size="sm" 
						onclick={addField}
						leadingIcon="mdi:plus"
						class="ml-auto h-8"
					>
						More Widgets
					</Button>
				</Card>

				<!-- Fields List -->
				<div
					use:dndzone={{ items, flipDurationMs, zoneTabIndex: -1 }}
					onconsider={handleDndConsider}
					onfinalize={handleDndFinalize}
					class="space-y-3 min-h-[200px]"
				>
					{#each items as item (item._dragId)}
						<div animate:flip={{ duration: flipDurationMs }} class="group relative">
							<Card class="flex items-center gap-4 p-3 pr-4 transition-all hover:border-primary-500 hover:shadow-lg hover:shadow-primary-500/5 bg-white dark:bg-surface-800">
								<!-- Drag Handle -->
								<div class="cursor-grab text-surface-300 active:cursor-grabbing group-hover:text-primary-500 transition-colors">
									<iconify-icon icon="mdi:drag-vertical" width="24"></iconify-icon>
								</div>

								<!-- Field Icon & Index -->
								<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-100 dark:bg-surface-900 border border-surface-200 dark:border-surface-700">
									<iconify-icon icon={item.icon || 'mdi:widgets'} width="20" class="text-primary-500"></iconify-icon>
								</div>

								<!-- Field Info -->
								<div class="flex-1 min-w-0 pr-4">
									<div class="flex items-center gap-2 mb-0.5">
										<span class="font-bold truncate text-sm sm:text-base">{item.label}</span>
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
									<Button variant="ghost" size="sm" onclick={() => editField(item)} title="Configure">
										<iconify-icon icon="mdi:cog" width="18"></iconify-icon>
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
						</div>
					{/if}
				</div>
			</div>
		{/if}
	</div>

	<!-- Right Side: Inspector -->
	{#if targetWidget.value && builderView === 'list'}
		<div class="shrink-0 flex animate-in slide-in-from-right duration-500">
			<WidgetInspector roles={roles} onSave={handleInspectorSave} />
		</div>
	{/if}
</div>
</div>
