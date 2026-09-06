<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget.svelte
@component Collection Widgets — Tab 2: field canvas (DnD) + available / marketplace palette
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
import { getGuiFields } from "@utils/schema/field-utils";
import { logger } from "@utils/logger";
import { onMount, untrack } from "svelte";
import { flip } from "svelte/animate";
import { draggable, droppable } from "@thisux/sveltednd";
import type { DragDropState } from "@thisux/sveltednd";
import ModalSelectWidget from "./collection-widget/modal-select-widget.svelte";
import ModalWidgetForm from "./collection-widget/modal-widget-form.svelte";
import Button from "@src/components/ui/button.svelte";
import Card from "@src/components/ui/card.svelte";
import FloatingInput from "@components/ui/floating-input.svelte";
import { generateCollectionTypeScript } from "../../../collection-code-generator";
import { inferWidgetFromFieldName, type InferredWidgetResult } from "../../../smart-inference";

type WidgetListItem = FieldInstance & { id: number; _dragId: string };

/** Palette → canvas drag payload */
type PaletteDrag = { kind: "palette"; widgetKey: string };
/** Canvas reorder payload */
type FieldDrag = { kind: "field"; dragId: string };

let { fields = [], roles = [] } = $props<{
	fields: FieldInstance[];
	roles?: Role[];
}>();

let dragIdsByIndex = $state<Record<number, string>>({});

let items = $state<WidgetListItem[]>(
	untrack(() =>
		(fields ?? []).map((f: FieldInstance, i: number) => {
			const id = (dragIdsByIndex[i] ??= crypto.randomUUID().slice(0, 8));
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
			nextDragIds[i] = crypto.randomUUID().slice(0, 8);
			added = true;
		}
	}
	if (added) dragIdsByIndex = nextDragIds;
	items = nextFields.map((f: FieldInstance, i: number) => ({
		id: i + 1,
		...f,
		_dragId: nextDragIds[i] ?? crypto.randomUUID().slice(0, 8),
	})) as WidgetListItem[];
});

const flipDurationMs = 180;

function updateStore() {
	if (collection.value) {
		const nextFields = items.map(
			({ _dragId, id: _id, ...rest }) => rest as FieldInstance,
		);
		setCollection({ ...collection.value, fields: nextFields });
	}
}

function reindexDragIds() {
	dragIdsByIndex = items.reduce(
		(acc, it, i) => {
			acc[i] = it._dragId;
			return acc;
		},
		{} as Record<number, string>,
	);
}

/** Reorder existing fields (same container) */
function handleFieldDrop(state: DragDropState<FieldDrag | PaletteDrag>) {
	const dragged = state.draggedItem;
	if (!dragged) return;

	// Palette widget dropped onto canvas
	if (dragged.kind === "palette") {
		void addSidebarWidget(dragged.widgetKey);
		return;
	}

	if (dragged.kind !== "field") return;

	const fromIndex = items.findIndex((i) => i._dragId === dragged.dragId);
	if (fromIndex < 0) return;

	const targetEl = state.targetElement?.closest(
		"[data-drag-id]",
	) as HTMLElement | null;
	const targetDragId = targetEl?.dataset?.dragId;

	let targetIndex: number;
	if (targetDragId) {
		targetIndex = items.findIndex((i) => i._dragId === targetDragId);
		if (state.dropPosition === "after") targetIndex++;
	} else {
		targetIndex = items.length;
	}
	targetIndex = Math.max(0, Math.min(targetIndex, items.length));
	if (fromIndex === targetIndex || fromIndex + 1 === targetIndex) return;

	const moving = items[fromIndex];
	items = untrack(() => {
		const next = [...items];
		next.splice(fromIndex, 1);
		const adjusted = fromIndex < targetIndex ? targetIndex - 1 : targetIndex;
		next.splice(adjusted, 0, moving);
		return next.map((it, i) => ({ ...it, id: i + 1 }));
	});
	reindexDragIds();
	updateStore();
}

// ── Widget Actions ──
function addField() {
	modalState.trigger(
		ModalSelectWidget as any,
		{
			title: "Add New Field",
			body: "Select a widget type to add to your collection",
			size: "xl",
		},
		(r: { selectedWidget: string } | false | undefined) => {
			if (!r || typeof r !== "object" || !("selectedWidget" in r)) return;
			void addSidebarWidget(r.selectedWidget, true);
		},
	);
}

function editField(field: WidgetListItem) {
	const idx = items.findIndex((i) => i._dragId === field._dragId);
	setTargetWidget({ ...field, __fieldIndex: idx >= 0 ? idx : undefined });

	modalState.trigger(
		ModalWidgetForm as any,
		{
			title: "Edit Field",
			body: "Configure field properties and permissions.",
			value: { ...field, __fieldIndex: idx >= 0 ? idx : undefined },
			roles,
			size: "lg",
		},
		(r: any) => {
			if (!r || r === false) return;
			if (r.__delete) {
				deleteField(field._dragId);
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
		(i) =>
			i._dragId === updated._dragId ||
			(updated.id != null && i.id === updated.id),
	);
	const existingNames = new SvelteSet(
		items.map((i) => i.db_fieldName).filter(Boolean) as string[],
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
			i === idx
				? ({ ...item, ...normalized, _dragId: item._dragId, id: item.id } as WidgetListItem)
				: item,
		);
	} else {
		const newDragId = crypto.randomUUID().slice(0, 8);
		const newIndex = items.length;
		dragIdsByIndex = { ...dragIdsByIndex, [newIndex]: newDragId };
		items = [
			...items,
			{
				id: newIndex + 1,
				_dragId: newDragId,
				...normalized,
			} as WidgetListItem,
		];
	}
	updateStore();
	toast.success("Field updated");
}

function deleteField(dragId: string) {
	items = items
		.filter((i) => i._dragId !== dragId)
		.map((item, idx) => ({ ...item, id: idx + 1 }));
	reindexDragIds();
	updateStore();
	toast.info("Field removed");
}

function duplicateField(field: WidgetListItem) {
	const newDragId = crypto.randomUUID().slice(0, 8);
	const newIndex = items.length;
	dragIdsByIndex = { ...dragIdsByIndex, [newIndex]: newDragId };
	const baseName = field.db_fieldName || "field";
	const existing = new SvelteSet(
		items.map((i) => i.db_fieldName).filter(Boolean) as string[],
	);
	let copyName = `${baseName}_copy`;
	let n = 1;
	while (existing.has(copyName)) copyName = `${baseName}_copy_${++n}`;

	items = [
		...items,
		{
			...field,
			id: newIndex + 1,
			_dragId: newDragId,
			label: `${field.label || "Field"} (Copy)`,
			db_fieldName: copyName,
		} as WidgetListItem,
	];
	updateStore();
	toast.success("Field duplicated");
}

async function addSidebarWidget(key: string, openEditor = true) {
	await widgetStoreActions.initializeWidgets();
	// Resolve case-insensitive so "input" / "Input" both work from E2E + palette
	const resolvedKey =
		getWidgetFunction(key)
			? key
			: Object.keys(widgets.widgetFunctions || {}).find(
					(k) => k.toLowerCase() === key.toLowerCase(),
				) || key;
	const widgetInstance = getWidgetFunction(resolvedKey);
	if (!widgetInstance) {
		toast.error(`Widget "${key}" is not installed`);
		return;
	}
	key = resolvedKey;

	const existing = new SvelteSet(
		items.map((i) => i.db_fieldName).filter(Boolean) as string[],
	);
	const base =
		key
			.toLowerCase()
			.replace(/\s+/g, "_")
			.replace(/[^a-z0-9_]/g, "") || "field";
	let dbName = `new_${base}`;
	let n = 0;
	while (existing.has(dbName)) dbName = `new_${base}_${++n}`;

	const newDragId = crypto.randomUUID().slice(0, 8);
	const newIndex = items.length;
	dragIdsByIndex = { ...dragIdsByIndex, [newIndex]: newDragId };

	const newWidget = {
		id: newIndex + 1,
		_dragId: newDragId,
		label: `New ${key}`,
		db_fieldName: dbName,
		widget: { key, Name: key } as any,
		icon: (widgetInstance as any).Icon || "mdi:widgets",
		GuiFields: getGuiFields({ key }, widgetInstance.GuiSchema as any),
		permissions: {},
	} as unknown as WidgetListItem;

	items = [...items, newWidget];
	updateStore();
	toast.success(`Added ${key} field`);

	if (openEditor) {
		// Open editor after a tick so list has the new row
		queueMicrotask(() => editField(newWidget));
	}
}

// ── Sidebar / marketplace ──
let sidebarSearch = $state("");
let remoteMarketplace = $state<
	Array<{ id: string; name: string; description?: string; version?: string }>
>([]);
let remoteLoading = $state(false);
let remoteError = $state<string | null>(null);

const MARKETPLACE_BROWSE =
	"https://marketplace.sveltycms.com/browse?type=widget";

onMount(() => {
	void loadRemoteMarketplace();
});

async function loadRemoteMarketplace() {
	remoteLoading = true;
	remoteError = null;
	try {
		const { marketplace } = await import(
			"@src/services/intelligence/marketplace-client"
		);
		const res = await marketplace.list({ type: "widget", limit: 24 });
		const list = (res.plugins || []) as any[];
		remoteMarketplace = list.map((p) => ({
			id: String(p.id || p.slug || p.name),
			name: p.name || p.slug || "Widget",
			description: p.description || "",
			version: p.version,
		}));
	} catch (err) {
		remoteError = "Marketplace offline — browse the site for more widgets";
		logger.warn("[CollectionWidget] marketplace list failed", err);
	} finally {
		remoteLoading = false;
	}
}

const availableWidgets = $derived(widgets.widgetFunctions || {});

function mapKeys(keys: string[]) {
	return keys
		.filter(
			(key) =>
				!sidebarSearch ||
				key.toLowerCase().includes(sidebarSearch.toLowerCase()),
		)
		.map((key) => ({
			key,
			label: key,
			icon: (availableWidgets[key] as any)?.Icon || "mdi:puzzle",
			description: (availableWidgets[key] as any)?.Description || "",
		}));
}

const coreWidgets = $derived(mapKeys(widgets.coreWidgets || []));
const customWidgets = $derived(mapKeys(widgets.customWidgets || []));
const installedMarketplace = $derived(mapKeys(widgets.marketplaceWidgets || []));

const remoteFiltered = $derived(
	remoteMarketplace.filter(
		(w) =>
			!sidebarSearch ||
			w.name.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
			(w.description || "").toLowerCase().includes(sidebarSearch.toLowerCase()),
	),
);

// ── Smart Quick-Add & Code Split-View ──
let viewMode = $state<"canvas" | "split" | "code">("canvas");
let quickAddInput = $state("");
let copied = $state(false);

const inferredWidget = $derived.by<InferredWidgetResult | null>(() => {
	const raw = quickAddInput.trim();
	if (!raw) return null;
	const existingKeys = Object.keys(availableWidgets || {});
	return inferWidgetFromFieldName(raw, existingKeys);
});

const generatedCode = $derived(
	generateCollectionTypeScript(collection.value || {}, items),
);

async function copyCode() {
	try {
		await navigator.clipboard.writeText(generatedCode);
		copied = true;
		toast.success("TypeScript schema copied to clipboard");
		setTimeout(() => {
			copied = false;
		}, 2000);
	} catch {
		toast.error("Failed to copy code");
	}
}

async function handleQuickAdd() {
	if (!inferredWidget) return;
	const target = inferredWidget;
	quickAddInput = "";

	await widgetStoreActions.initializeWidgets();
	const resolvedKey =
		getWidgetFunction(target.widgetKey)
			? target.widgetKey
			: Object.keys(widgets.widgetFunctions || {}).find(
					(k) => k.toLowerCase() === target.widgetKey.toLowerCase(),
				) || "input";

	const existing = new SvelteSet(
		items.map((i) => i.db_fieldName).filter(Boolean) as string[],
	);
	let dbName = target.db_fieldName;
	let n = 0;
	while (existing.has(dbName)) dbName = `${target.db_fieldName}_${++n}`;

	const newDragId = crypto.randomUUID().slice(0, 8);
	const newIndex = items.length;
	dragIdsByIndex = { ...dragIdsByIndex, [newIndex]: newDragId };

	const newWidget: WidgetListItem = {
		id: newIndex + 1,
		_dragId: newDragId,
		label: target.label,
		db_fieldName: dbName,
		icon: target.icon,
		required: false,
		widget: {
			Name: resolvedKey.charAt(0).toUpperCase() + resolvedKey.slice(1),
			key: resolvedKey,
			...(target.defaults),
		} as any,
	};

	items = [...items, newWidget];
	updateStore();
	toast.success(`Added ${target.label} (${target.displayName})`);
}
</script>

{#snippet codePane(fullWidth = false)}
	<div
		class="flex min-h-0 min-w-0 flex-1 flex-col {fullWidth ? 'w-full' : 'border-surface-500/30 dark:border-surface-500/40 lg:border-s'}"
		data-testid="collection-code-pane"
	>
		<!-- Header -->
		<div
			class="flex shrink-0 flex-wrap items-center gap-3 border-b border-surface-500/30 bg-surface-500/10 px-4 py-3 dark:border-surface-500/40 dark:bg-surface-900 sm:px-6"
		>
			<div class="flex items-center gap-2 text-sm font-semibold text-surface-600 dark:text-surface-400">
				<iconify-icon icon="mdi:code-json" width="20" class="text-tertiary-500"></iconify-icon>
				<span class="font-mono text-xs font-bold text-surface-900 dark:text-surface-100">
					config/collections/{(collection.value?.name || 'collection').toLowerCase().replace(/\s+/g, '_')}.ts
				</span>
				<span class="inline-flex items-center gap-1 rounded-full bg-success-500/10 px-2 py-0.5 text-[10px] font-semibold text-success-500 dark:bg-success-500/20">
					<span class="h-1.5 w-1.5 rounded-full bg-success-500 animate-pulse"></span>
					Live Parity
				</span>
			</div>

			<!-- View mode switcher if in fullWidth code view -->
			{#if fullWidth}
				<div class="flex items-center rounded-lg border border-surface-500/30 bg-surface-500/10 p-0.5 dark:border-surface-500/40 dark:bg-surface-500/10 ms-2" role="group" aria-label="View Mode">
					<button
						type="button"
						class="px-2.5 py-1 text-xs font-medium rounded transition-colors {viewMode === 'canvas' ? 'bg-white dark:bg-surface-800 shadow-xs text-primary-500 font-bold' : 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-200'}"
						onclick={() => (viewMode = 'canvas')}
						data-testid="code-view-mode-canvas"
					>
						Canvas
					</button>
					<button
						type="button"
						class="px-2.5 py-1 text-xs font-medium rounded transition-colors {viewMode === 'split' ? 'bg-white dark:bg-surface-800 shadow-xs text-primary-500 font-bold' : 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-200'}"
						onclick={() => (viewMode = 'split')}
						data-testid="code-view-mode-split"
					>
						Split View
					</button>
					<button
						type="button"
						class="px-2.5 py-1 text-xs font-medium rounded transition-colors {viewMode === 'code' ? 'bg-white dark:bg-surface-800 shadow-xs text-primary-500 font-bold' : 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-200'}"
						onclick={() => (viewMode = 'code')}
						data-testid="code-view-mode-code"
					>
						TypeScript
					</button>
				</div>
			{/if}

			<div class="ms-auto flex items-center gap-2">
				<Button
					variant="secondary"
					size="sm"
					onclick={copyCode}
					leadingIcon={copied ? "mdi:check" : "mdi:content-copy"}
					data-testid="copy-ts-code-button"
				>
					{copied ? "Copied!" : "Copy Code"}
				</Button>
			</div>
		</div>

		<!-- Code Display Area -->
		<div class="min-h-0 flex-1 overflow-auto bg-surface-500/10 p-4 font-mono text-xs text-surface-200 selection:bg-primary-500/30">
			<pre class="leading-relaxed whitespace-pre font-mono"><code>{generatedCode}</code></pre>
		</div>

		<!-- Footer -->
		<div class="shrink-0 border-t border-surface-500/30 bg-surface-500/10 px-4 py-2 text-[11px] text-surface-400 dark:border-surface-500/40 dark:bg-surface-900/60 flex items-center justify-between">
			<span>⚡ Real-time TypeScript schema parity with <code>compilation/compile.ts</code></span>
			<span class="font-mono text-[10px] opacity-70">{items.length} fields defined</span>
		</div>
	</div>
{/snippet}

<div
	class="flex h-full min-h-112 w-full flex-col lg:flex-row"
	data-testid="collection-widgets-tab"
>
	{#if viewMode === "code"}
		{@render codePane(true)}
	{:else}
		<!-- ═══ LEFT: Field canvas (visible in canvas & split modes) ═══ -->
		<div
			class="flex min-h-0 min-w-0 flex-1 flex-col border-surface-500/30 dark:border-surface-500/40 lg:border-e"
		>
			<div
				class="flex shrink-0 flex-wrap items-center gap-3 border-b border-surface-500/30 bg-surface-500/10 px-4 py-3 dark:border-surface-500/40 dark:bg-surface-900 sm:px-6"
			>
				<div class="flex items-center gap-2 text-sm font-semibold text-surface-600 dark:text-surface-400">
					<iconify-icon icon="mdi:widgets" width="20" class="text-primary-500"></iconify-icon>
					<span
						>{items.length}
						{items.length === 1 ? "Widget" : "Widgets"}</span
					>
				</div>

				<!-- View Mode Switcher -->
				<div class="flex items-center rounded-lg border border-surface-500/30 bg-surface-500/10 p-0.5 dark:border-surface-500/40 dark:bg-surface-500/10 ms-2" role="group" aria-label="View Mode">
					<button
						type="button"
						class="px-2.5 py-1 text-xs font-medium rounded transition-colors {viewMode === 'canvas' ? 'bg-white dark:bg-surface-800 shadow-xs text-primary-500 font-bold' : 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-200'}"
						onclick={() => (viewMode = 'canvas')}
						data-testid="view-mode-canvas"
					>
						Canvas
					</button>
					<button
						type="button"
						class="px-2.5 py-1 text-xs font-medium rounded transition-colors {viewMode === 'split' ? 'bg-white dark:bg-surface-800 shadow-xs text-primary-500 font-bold' : 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-200'}"
						onclick={() => (viewMode = 'split')}
						data-testid="view-mode-split"
					>
						Split View
					</button>
					<button
						type="button"
						class="px-2.5 py-1 text-xs font-medium rounded transition-colors {viewMode === 'code' ? 'bg-white dark:bg-surface-800 shadow-xs text-primary-500 font-bold' : 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-200'}"
						onclick={() => (viewMode = 'code')}
						data-testid="view-mode-code"
					>
						TypeScript
					</button>
				</div>

				<div class="ms-auto flex items-center gap-2">
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

			<div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
				<!-- Quick Add Bar -->
				<div class="mx-auto mb-4 max-w-4xl rounded-xl border border-surface-500/30 bg-surface-500/10 p-3 dark:border-surface-500/40 dark:bg-surface-900/20">
					<div class="flex items-center gap-2">
						<div class="relative flex-1">
							<input aria-label="Quick-Add field names"
								type="text"
								bind:value={quickAddInput}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										handleQuickAdd();
									}
								}}
								placeholder="⚡ Quick-Add: type 'email', 'price', 'cover_photo', 'tags', 'bio' and hit Enter..."
								class="w-full rounded-lg border border-surface-500/30 bg-white px-3.5 py-2 text-xs sm:text-sm text-surface-900 placeholder:text-surface-400 focus:border-primary-500 focus:outline-hidden dark:border-surface-500/40 dark:bg-surface-800 dark:text-white"
								data-testid="quick-add-field-input"
							/>
						</div>
						<Button
							variant="primary"
							size="sm"
							disabled={!inferredWidget}
							onclick={handleQuickAdd}
							leadingIcon="mdi:plus"
							data-testid="quick-add-field-button"
						>
							Add Field
						</Button>
					</div>
					{#if inferredWidget}
						<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
							<span class="text-surface-500">Inferred:</span>
							<span class="inline-flex items-center gap-1 rounded-full bg-primary-500/10 px-2.5 py-0.5 font-medium text-primary-500 dark:bg-primary-500/20">
								<iconify-icon icon={inferredWidget.icon} width="14"></iconify-icon>
								{inferredWidget.displayName}
								<span class="opacity-60">({inferredWidget.db_fieldName})</span>
							</span>
							<span class="text-surface-400 ms-auto hidden sm:inline">Press Enter ↵ to add</span>
						</div>
					{/if}
				</div>

				<div
					use:droppable={{
						container: "widget-fields",
						callbacks: { onDrop: handleFieldDrop },
						direction: "vertical",
						attributes: { dragOverClass: "ring-2 ring-primary-500/40 bg-primary-500/10" },
					}}
					class="mx-auto min-h-50 max-w-4xl space-y-3 rounded-xl p-1"
					data-testid="widget-fields-list"
					role="list"
					aria-label="Widget fields list"
				>
				{#each items as item (item._dragId)}
					<div
						use:draggable={{
							container: "widget-fields",
							dragData: { kind: "field", dragId: item._dragId } satisfies FieldDrag,
							keyboard: true,
							handle: ".field-drag-handle",
						}}
						use:droppable={{
							container: "widget-fields",
							callbacks: { onDrop: handleFieldDrop },
							direction: "vertical",
							attributes: { dragOverClass: "ring-2 ring-primary-400/50" },
						}}
						animate:flip={{ duration: flipDurationMs }}
						class="group relative"
						data-testid="widget-field-row"
						data-field-name={item.db_fieldName || ""}
						data-drag-id={item._dragId}
						role="listitem"
					>
						<Card
							class="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:gap-4 sm:pe-4 transition-all hover:border-primary-500 hover:shadow-md bg-white dark:bg-surface-800"
						>
							<div
								class="field-drag-handle flex cursor-grab items-center justify-center self-start rounded p-1 text-surface-300 active:cursor-grabbing group-hover:text-primary-500 sm:self-center"
								aria-hidden="true"
							>
								<iconify-icon icon="mdi:drag-vertical" width="24"></iconify-icon>
							</div>

							<div
								class="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-surface-500/30 bg-surface-500/10 dark:border-surface-500/40 dark:bg-surface-900"
							>
								<iconify-icon
									icon={item.icon ||
										(availableWidgets[(item.widget as any)?.key] as any)?.Icon ||
										"mdi:widgets"}
									width="20"
									class="text-primary-500"
								></iconify-icon>
							</div>

							<button
								type="button"
								class="min-w-0 flex-1 border-0 bg-transparent p-0 text-start"
								onclick={() => editField(item)}
								data-testid="widget-field-open"
								aria-label={`Edit field ${item.label || "Unnamed Field"}`}
							>
								<div class="mb-0.5 flex flex-wrap items-center gap-2">
									<span class="truncate text-sm font-bold sm:text-base"
										>{item.label || "Unnamed Field"}</span
									>
									<span
										class="rounded bg-surface-200 px-1.5 py-0.5 text-[9px] font-black tracking-wider text-surface-600 uppercase dark:bg-surface-700 dark:text-surface-400"
									>
										{(item.widget as { key?: string })?.key ||
											(item.widget as { Name?: string })?.Name ||
											"Generic"}
									</span>
								</div>
								<div class="flex flex-wrap items-center gap-3">
									<code
										class="truncate rounded bg-surface-500/10 px-1 text-[10px] text-surface-400 dark:bg-surface-900 dark:text-surface-50"
									>
										{item.db_fieldName || "unnamed_field"}
									</code>
									{#if item.required}
										<span class="flex items-center gap-0.5 text-[9px] font-bold text-error-500">
											<iconify-icon icon="mdi:asterisk" width="8"></iconify-icon> Required
										</span>
									{/if}
								</div>
							</button>

							<div class="flex shrink-0 items-center gap-1 sm:gap-1.5">
								<Button
									variant="ghost"
									size="sm"
									type="button"
									onclick={(e: MouseEvent) => {
										e.stopPropagation();
										editField(item);
									}}
									title="Edit"
									data-testid="widget-field-edit"
									aria-label="Edit field"
								>
									<iconify-icon icon="mdi:pencil" width="18"></iconify-icon>
								</Button>
								<Button
									variant="ghost"
									size="sm"
									type="button"
									onclick={(e: MouseEvent) => {
										e.stopPropagation();
										duplicateField(item);
									}}
									title="Duplicate"
									data-testid="widget-field-clone"
									aria-label="Duplicate field"
								>
									<iconify-icon icon="mdi:content-copy" width="18"></iconify-icon>
								</Button>
								<Button
									variant="ghost"
									size="sm"
									type="button"
									onclick={(e: MouseEvent) => {
										e.stopPropagation();
										deleteField(item._dragId);
									}}
									class="text-error-500 hover:bg-error-500/10"
									title="Remove"
									data-testid="widget-field-delete"
									aria-label="Remove field"
								>
									<iconify-icon icon="mdi:trash-can" width="18"></iconify-icon>
								</Button>
							</div>
						</Card>
					</div>
				{/each}

				{#if items.length === 0}
					<div
						class="flex h-56 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-surface-500/30 bg-surface-500/30 text-surface-400 dark:border-surface-500/40 dark:bg-surface-900/10 dark:text-surface-50"
					>
						<iconify-icon icon="mdi:widgets-outline" width="48" class="mb-3 opacity-20"
						></iconify-icon>
						<p class="text-sm font-medium">Add your first widget to start building</p>
						<p class="mt-1 max-w-xs text-center text-xs opacity-60">
							Click or drag a widget from the right palette, or use Add Widget
						</p>
					</div>
				{/if}
			</div>
		</div>
	</div>

	{#if viewMode === "split"}
		{@render codePane(false)}
	{:else}
		<!-- ═══ RIGHT: Palette ═══ -->
		<aside
		class="flex w-full shrink-0 flex-col border-t border-surface-500/30 bg-surface-500/80 dark:border-surface-500/40 dark:bg-surface-900/50 lg:w-80 lg:border-t-0 xl:w-96"
		data-testid="widget-palette"
	>
		<div class="shrink-0 space-y-3 border-b border-surface-500/30 p-4 dark:border-surface-500/40">
			<h3
				class="flex items-center gap-2 text-sm font-bold tracking-wider text-surface-500 uppercase dark:text-surface-400"
			>
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
			<p class="text-[11px] text-surface-500">
				Click to add, or drag onto the field list.
			</p>
		</div>

		<div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 sm:p-4">
			{#snippet paletteSection(title: string, list: typeof coreWidgets, tone: 'core' | 'custom' | 'market')}
				{#if list.length > 0}
					<div>
						<h4
							class="mb-2 px-1 text-[10px] font-bold tracking-widest text-surface-400 uppercase"
						>
							{title}
						</h4>
						<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
							{#each list as w (w.key)}
								<button
									type="button"
									use:draggable={{
										container: "widget-palette",
										dragData: { kind: "palette", widgetKey: w.key } satisfies PaletteDrag,
										keyboard: true,
									}}
									onclick={() => addSidebarWidget(w.key)}
									data-testid={`quick-add-${w.key.toLowerCase()}`}
									aria-label={`Add ${w.label} widget`}
									class="group flex flex-col items-center justify-center gap-2 rounded-lg border border-surface-500/30 bg-white p-3 text-center transition-all hover:border-primary-500 hover:bg-primary-500/10 dark:border-surface-500/40 dark:bg-surface-800 dark:hover:bg-primary-900/20 {tone === 'market' ? 'hover:border-warning-500' : ''}"
								>
									<div
										class="flex h-9 w-9 items-center justify-center rounded bg-surface-500/10 text-surface-500 transition-colors group-hover:bg-primary-500 group-hover:text-white dark:bg-surface-700 {tone === 'market' ? 'text-warning-500 group-hover:bg-warning-500' : ''}"
									>
										<iconify-icon icon={w.icon} width="20"></iconify-icon>
									</div>
									<span
										class="text-[11px] leading-tight font-semibold text-surface-600 dark:text-surface-400"
										>{w.label}</span
									>
								</button>
							{/each}
						</div>
					</div>
				{/if}
			{/snippet}

			{@render paletteSection("Core", coreWidgets, "core")}
			{@render paletteSection("Custom", customWidgets, "custom")}
			{@render paletteSection("Installed from Marketplace", installedMarketplace, "market")}

			<!-- Remote marketplace catalog -->
			<div>
				<div class="mb-2 flex items-center justify-between px-1">
					<h4 class="text-[10px] font-bold tracking-widest text-surface-400 uppercase">
						Marketplace
					</h4>
					{#if remoteLoading}
						<span class="text-[10px] text-surface-400">Loading…</span>
					{/if}
				</div>

				{#if remoteError}
					<p class="mb-2 px-1 text-[11px] text-warning-600 dark:text-warning-400">{remoteError}</p>
				{/if}

				{#if remoteFiltered.length > 0}
					<div class="space-y-2">
						{#each remoteFiltered as w (w.id)}
							<div
								class="rounded-lg border border-warning-500/30 bg-white p-3 dark:border-warning-500/40 dark:bg-surface-800"
							>
								<div class="flex items-start gap-2">
									<div
										class="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-warning-500/10 text-warning-600"
									>
										<iconify-icon icon="mdi:store" width="18"></iconify-icon>
									</div>
									<div class="min-w-0 flex-1">
										<p class="truncate text-xs font-semibold">{w.name}</p>
										{#if w.description}
											<p class="line-clamp-2 text-[10px] text-surface-500">{w.description}</p>
										{/if}
									</div>
								</div>
								<a
									href={`${MARKETPLACE_BROWSE}&q=${encodeURIComponent(w.name)}`}
									target="_blank"
									rel="noopener noreferrer"
									class="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-warning-600 hover:underline dark:text-warning-400"
								>
									View on Marketplace
									<iconify-icon icon="mdi:open-in-new" width="12"></iconify-icon>
								</a>
							</div>
						{/each}
					</div>
				{:else if !remoteLoading}
					<p class="px-1 text-[11px] text-surface-500">
						No remote widgets listed. Browse the full catalog below.
					</p>
				{/if}
			</div>
		</div>

		<div class="shrink-0 space-y-2 border-t border-surface-500/30 p-3 dark:border-surface-500/40">
			<a
				href={MARKETPLACE_BROWSE}
				target="_blank"
				rel="noopener noreferrer"
				data-testid="browse-marketplace-widgets"
				class="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-warning-500/30 bg-warning-500/10 p-3 text-sm font-semibold text-warning-600 transition-colors hover:bg-warning-500/10 dark:border-warning-500/40 dark:bg-warning-900/20 dark:text-warning-400 dark:hover:bg-warning-900/20"
			>
				<iconify-icon icon="mdi:store-outline" width="18"></iconify-icon>
				Browse Widget Marketplace
				<iconify-icon icon="mdi:open-in-new" width="16"></iconify-icon>
			</a>
			<a
				href="/config/extension"
				class="flex items-center justify-center gap-2 rounded-lg border border-surface-500/30 p-2 text-xs font-medium text-surface-600 hover:bg-surface-500/10 dark:border-surface-500/40 dark:text-surface-300 dark:hover:bg-surface-800"
			>
				<iconify-icon icon="mdi:puzzle-outline" width="16"></iconify-icon>
				Installed extensions & widgets
			</a>
		</div>
	</aside>
	{/if}
{/if}
</div>
