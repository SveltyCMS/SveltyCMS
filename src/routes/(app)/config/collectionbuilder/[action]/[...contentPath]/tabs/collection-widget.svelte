<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget.svelte
@component Collection Widgets — Tab 2: field canvas (DnD) + available / marketplace palette
 -->
<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { FieldInstance } from '@src/content/types';
	import type { Role } from '@src/databases/auth/types';
	import { generateUUID } from '@utils/native-utils';
	import { collections, setCollection, setTargetWidget } from '@src/stores/collection-store.svelte';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { getWidgetFunction, widgets } from '@src/stores/widget-store.svelte.ts';
	import { modalState } from '@utils/modal.svelte';
	import { getGuiFields } from '@utils/schema/field-utils';
	import { logger } from '@utils/logger';
	import {
		builder_duplicate,
		builder_remove,
		builder_required,
		builder_ts_add_field,
		builder_ts_available_widgets,
		builder_ts_browse_marketplace,
		builder_ts_click_configure,
		builder_ts_click_to_add,
		builder_ts_config_path,
		builder_ts_drag_hint,
		builder_ts_drag_reorder_title,
		builder_ts_duplicate,
		builder_ts_duplicate_aria,
		builder_ts_duplicate_badge_title,
		builder_ts_duplicate_banner_title,
		builder_ts_duplicate_banner_body_part1,
		builder_ts_duplicate_banner_body_part2,
		builder_ts_edit_field_aria,
		builder_ts_empty_heading,
		builder_ts_empty_intro,
		builder_ts_extensions_link,
		builder_ts_fields_defined,
		builder_ts_fields_list_aria,
		builder_ts_inferred_widget,
		builder_ts_live_parity,
		builder_ts_loading,
		builder_ts_marketplace,
		builder_ts_marketplace_view,
		builder_ts_move_down_title,
		builder_ts_move_up_title,
		builder_ts_no_remote,
		builder_ts_parity_code,
		builder_ts_parity_part1,
		builder_ts_press_enter,
		builder_ts_quick_add_aria,
		builder_ts_quick_add_placeholder,
		builder_ts_remove_field_aria,
		builder_ts_search_aria,
		builder_ts_search_placeholder,
		builder_ts_ts_suffix,
		builder_ts_widget_category_aria,
		button_edit,
		widget_form_edit_field
	} from '@src/paraglide/messages';
	import { onMount, untrack } from 'svelte';
	import { flip } from 'svelte/animate';

	import ModalWidgetForm from './collection-widget/modal-widget-form.svelte';
	import FormPreview from './collection-widget/form-preview.svelte';
	import Button from '@src/components/ui/button.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import FloatingInput from '@components/ui/floating-input.svelte';
	import { generateCollectionTypeScript } from '../../../collection-code-generator';
	import { inferWidgetFromFieldName, type InferredWidgetResult } from '../../../smart-inference';
	import { draggable, droppable, dndState } from '@thisux/sveltednd';
	import type { DragDropState } from '@thisux/sveltednd';

	type WidgetListItem = FieldInstance & { id: number; _dragId: string };

	/** Palette → canvas drag payload */
	type PaletteDrag = { kind: 'palette'; widgetKey: string };
	/** Canvas reorder payload */
	type FieldDrag = { kind: 'field'; dragId: string };

	let {
		fields = [],
		roles = [],
		viewMode = $bindable('canvas')
	} = $props<{
		fields: FieldInstance[];
		roles?: Role[];
		viewMode?: 'canvas' | 'split' | 'code' | 'preview';
	}>();

	let dragIdsByIndex = $state<Record<number, string>>({});

	let items = $state<WidgetListItem[]>(
		untrack(() =>
			(fields ?? []).map((f: FieldInstance, i: number) => {
				const id = (dragIdsByIndex[i] ??= generateUUID());
				return { id: i + 1, ...f, _dragId: id } as WidgetListItem;
			})
		)
	);

	// Sync items from props when store updates
	$effect(() => {
		const nextFields = fields ?? [];
		const nextDragIds = { ...dragIdsByIndex };
		let added = false;
		for (let i = 0; i < nextFields.length; i++) {
			if (nextDragIds[i] === undefined) {
				nextDragIds[i] = generateUUID();
				added = true;
			}
		}
		if (added) dragIdsByIndex = nextDragIds;
		items = nextFields.map((f: FieldInstance, i: number) => ({
			id: i + 1,
			...f,
			_dragId: nextDragIds[i] ?? generateUUID()
		})) as WidgetListItem[];
	});

	const flipDurationMs = 180;

	function updateStore() {
		if (collections.active) {
			const nextFields = items.map(({ _dragId, id: _id, ...rest }) => rest as FieldInstance);
			setCollection({ ...collections.active, fields: nextFields });
		}
	}

	function reindexDragIds() {
		dragIdsByIndex = items.reduce(
			(acc, it, i) => {
				acc[i] = it._dragId;
				return acc;
			},
			{} as Record<number, string>
		);
	}

	/** True when dropping the dragged field at `targetIndex` would leave the order unchanged. */
	function isNoopFieldDrop(targetIndex: number): boolean {
		const dragged = dndState.draggedItem as FieldDrag | PaletteDrag | null;
		if (dragged?.kind !== 'field') return false;
		const fromIndex = items.findIndex((i) => i._dragId === dragged.dragId);
		return fromIndex === targetIndex || fromIndex + 1 === targetIndex;
	}

	/**
	 * Where the single insertion line is drawn. Derived from dndState instead of
	 * sveltednd's own blue indicators, which it paints on every droppable and moves
	 * onto the next sibling for "after". Covers field reorders and palette widgets,
	 * which are inserted at the same slot.
	 */
	function dropLineFor(dragId: string): 'before' | 'after' | null {
		if (!dndState.isDragging || dndState.targetContainer !== `field:${dragId}`) return null;
		const pos = dndState.dropPosition;
		if (pos !== 'before' && pos !== 'after') return null;
		const index = items.findIndex((i) => i._dragId === dragId) + (pos === 'after' ? 1 : 0);
		return isNoopFieldDrop(index) ? null : pos;
	}

	const endZoneActive = $derived(
		dndState.isDragging &&
			dndState.targetContainer === 'widget-fields-end' &&
			!isNoopFieldDrop(items.length)
	);

	/** Reorder existing fields, or insert a palette widget at the drop slot */
	function handleFieldDrop(state: DragDropState<FieldDrag | PaletteDrag>) {
		const dragged = state.draggedItem;
		if (!dragged) return;

		// Row → its slot (before/after); end zone or empty state → append.
		const targetEl = state.targetElement?.closest('[data-drag-id]') as HTMLElement | null;
		const targetDragId = targetEl?.dataset?.dragId;

		let targetIndex: number;
		if (targetDragId) {
			targetIndex = items.findIndex((i) => i._dragId === targetDragId);
			if (state.dropPosition === 'after') targetIndex++;
		} else {
			targetIndex = items.length;
		}
		targetIndex = Math.max(0, Math.min(targetIndex, items.length));

		// Palette widget dropped onto canvas: same add flow as a click, at this slot
		if (dragged.kind === 'palette') {
			void addSidebarWidget(dragged.widgetKey, true, targetIndex);
			return;
		}

		if (dragged.kind !== 'field') return;

		const fromIndex = items.findIndex((i) => i._dragId === dragged.dragId);
		if (fromIndex < 0) return;
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
	function editField(field: WidgetListItem) {
		const idx = items.findIndex((i) => i._dragId === field._dragId);
		setTargetWidget({ ...field, __fieldIndex: idx >= 0 ? idx : undefined });

		modalState.trigger(
			ModalWidgetForm as any,
			{
				// The form renders its own header; ariaLabel names the dialog instead of `title`.
				ariaLabel: widget_form_edit_field(),
				value: { ...field, __fieldIndex: idx >= 0 ? idx : undefined },
				roles,
				size: 'xl',
				contentClass: 'p-0!'
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
			}
		);
	}

	function handleInspectorSave(updated: any) {
		const idx = items.findIndex(
			(i) => i._dragId === updated._dragId || (updated.id != null && i.id === updated.id)
		);
		const existingNames = new SvelteSet(
			items.map((i) => i.db_fieldName).filter(Boolean) as string[]
		);

		const ensureFieldName = (obj: Record<string, unknown>): string => {
			const name =
				(obj.db_fieldName as string) ||
				(obj.label as string) ||
				(obj.widget as { Name?: string })?.Name ||
				'field';
			const base =
				String(name)
					.trim()
					.replace(/\s+/g, '_')
					.replace(/[^a-zA-Z0-9_]/g, '') || 'field';
			let candidate = base;
			let n = 0;
			if (idx !== -1 && items[idx].db_fieldName === candidate) return candidate;
			while (existingNames.has(candidate)) candidate = `${base}_${++n}`;
			existingNames.add(candidate);
			return candidate;
		};

		const normalized = {
			...updated,
			db_fieldName: updated.db_fieldName || ensureFieldName(updated)
		};

		if (idx !== -1) {
			items = items.map((item, i) =>
				i === idx
					? ({ ...item, ...normalized, _dragId: item._dragId, id: item.id } as WidgetListItem)
					: item
			);
		} else {
			const newDragId = generateUUID();
			const newIndex = items.length;
			dragIdsByIndex = { ...dragIdsByIndex, [newIndex]: newDragId };
			items = [
				...items,
				{
					id: newIndex + 1,
					_dragId: newDragId,
					...normalized
				} as WidgetListItem
			];
		}
		updateStore();
		toast.success('Field updated');
	}

	function deleteField(dragId: string) {
		items = items
			.filter((i) => i._dragId !== dragId)
			.map((item, idx) => ({ ...item, id: idx + 1 }));
		reindexDragIds();
		updateStore();
		toast.info('Field removed');
	}

	function duplicateField(field: WidgetListItem) {
		const newDragId = generateUUID();
		const newIndex = items.length;
		dragIdsByIndex = { ...dragIdsByIndex, [newIndex]: newDragId };
		const baseName = field.db_fieldName || 'field';
		const existing = new SvelteSet(items.map((i) => i.db_fieldName).filter(Boolean) as string[]);
		let copyName = `${baseName}_copy`;
		let n = 1;
		while (existing.has(copyName)) copyName = `${baseName}_copy_${++n}`;

		items = [
			...items,
			{
				...field,
				id: newIndex + 1,
				_dragId: newDragId,
				label: `${field.label || 'Field'} (Copy)`,
				db_fieldName: copyName
			} as WidgetListItem
		];
		updateStore();
		toast.success('Field duplicated');
	}

	/** Add a widget field; `atIndex` inserts at a drop slot, otherwise it is appended. */
	async function addSidebarWidget(key: string, openEditor = true, atIndex?: number) {
		await widgets.initialize();
		// Resolve case-insensitive so "input" / "Input" both work from E2E + palette
		const resolvedKey = getWidgetFunction(key)
			? key
			: Object.keys(widgets.widgetFunctions || {}).find(
					(k) => k.toLowerCase() === key.toLowerCase()
				) || key;
		const widgetInstance = getWidgetFunction(resolvedKey);
		if (!widgetInstance) {
			toast.error(`Widget "${key}" is not installed`);
			return;
		}
		key = resolvedKey;

		const existing = new SvelteSet(items.map((i) => i.db_fieldName).filter(Boolean) as string[]);
		const base =
			key
				.toLowerCase()
				.replace(/\s+/g, '_')
				.replace(/[^a-z0-9_]/g, '') || 'field';
		let dbName = `new_${base}`;
		let n = 0;
		while (existing.has(dbName)) dbName = `new_${base}_${++n}`;

		const newDragId = generateUUID();
		const insertAt =
			atIndex === undefined ? items.length : Math.max(0, Math.min(atIndex, items.length));

		const newWidget = {
			id: insertAt + 1,
			_dragId: newDragId,
			label: `New ${key}`,
			db_fieldName: dbName,
			widget: { key, Name: key } as any,
			icon: (widgetInstance as any).Icon || 'mdi:widgets',
			GuiFields: getGuiFields({ key }, widgetInstance.GuiSchema as any),
			permissions: {}
		} as unknown as WidgetListItem;

		items = [...items.slice(0, insertAt), newWidget, ...items.slice(insertAt)].map((it, i) => ({
			...it,
			id: i + 1
		}));
		reindexDragIds();
		updateStore();
		toast.success(`Added ${key} field`);

		if (openEditor) {
			// Open editor after a tick so list has the new row
			queueMicrotask(() => editField(newWidget));
		}
	}

	// ── Sidebar / marketplace ──
	let sidebarSearch = $state('');
	let remoteMarketplace = $state<
		Array<{ id: string; name: string; description?: string; version?: string }>
	>([]);
	let remoteLoading = $state(false);
	let remoteError = $state<string | null>(null);

	const MARKETPLACE_BROWSE = 'https://marketplace.sveltycms.com/browse?type=widget';

	onMount(() => {
		void loadRemoteMarketplace();
	});

	async function loadRemoteMarketplace() {
		remoteLoading = true;
		remoteError = null;
		try {
			const { marketplace } = await import('@src/services/intelligence/marketplace-client');
			const res = await marketplace.list({ type: 'widget', limit: 24 });
			const list = (res.plugins || []) as any[];
			remoteMarketplace = list.map((p) => ({
				id: String(p.id || p.slug || p.name),
				name: p.name || p.slug || 'Widget',
				description: p.description || '',
				version: p.version
			}));
		} catch (err) {
			remoteError = 'Marketplace offline — browse the site for more widgets';
			logger.warn('[CollectionWidget] marketplace list failed', err);
		} finally {
			remoteLoading = false;
		}
	}

	function moveFieldUp(index: number) {
		if (index <= 0 || index >= items.length) return;
		const label = items[index]?.label || 'field';
		items = untrack(() => {
			const next = [...items];
			const temp = next[index - 1];
			next[index - 1] = next[index];
			next[index] = temp;
			return next.map((it, i) => ({ ...it, id: i + 1 }));
		});
		reindexDragIds();
		updateStore();
		toast.info(`Moved ${label} up`);
	}

	function moveFieldDown(index: number) {
		if (index < 0 || index >= items.length - 1) return;
		const label = items[index]?.label || 'field';
		items = untrack(() => {
			const next = [...items];
			const temp = next[index + 1];
			next[index + 1] = next[index];
			next[index] = temp;
			return next.map((it, i) => ({ ...it, id: i + 1 }));
		});
		reindexDragIds();
		updateStore();
		toast.info(`Moved ${label} down`);
	}

	const duplicateFieldNames = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const item of items) {
			const name = (item.db_fieldName || '').trim().toLowerCase();
			if (name) {
				counts.set(name, (counts.get(name) || 0) + 1);
			}
		}
		const duplicates = new SvelteSet<string>();
		for (const [name, count] of counts.entries()) {
			if (count > 1) duplicates.add(name);
		}
		return duplicates;
	});

	const availableWidgets = $derived(widgets.widgetFunctions || {});

	type WidgetCategory = 'all' | 'inputs' | 'media' | 'structure' | 'advanced';
	let selectedCategory = $state<WidgetCategory>('all');

	function matchesCategory(key: string, category: WidgetCategory): boolean {
		if (category === 'all') return true;
		const k = key.toLowerCase();
		switch (category) {
			case 'inputs':
				return (
					k.includes('input') ||
					k.includes('email') ||
					k.includes('number') ||
					k.includes('phone') ||
					k.includes('currency') ||
					k.includes('price') ||
					k.includes('date') ||
					k.includes('rating') ||
					k.includes('color') ||
					k.includes('slug') ||
					k.includes('check') ||
					k.includes('radio') ||
					k.includes('select') ||
					k.includes('switch')
				);
			case 'media':
				return (
					k.includes('media') ||
					k.includes('video') ||
					k.includes('image') ||
					k.includes('upload') ||
					k.includes('audio') ||
					k.includes('file')
				);
			case 'structure':
				return (
					k.includes('group') ||
					k.includes('relation') ||
					k.includes('block') ||
					k.includes('repeat') ||
					k.includes('menu') ||
					k.includes('array')
				);
			case 'advanced':
				return (
					k.includes('ai') ||
					k.includes('geo') ||
					k.includes('address') ||
					k.includes('json') ||
					k.includes('seo') ||
					k.includes('rich') ||
					k.includes('markdown') ||
					k.includes('tag')
				);
			default:
				return true;
		}
	}

	function mapKeys(keys: string[]) {
		return keys
			.filter((key) => {
				const matchesSearch =
					!sidebarSearch || key.toLowerCase().includes(sidebarSearch.toLowerCase());
				const matchesCat = matchesCategory(key, selectedCategory);
				return matchesSearch && matchesCat;
			})
			.map((key) => ({
				key,
				label: key,
				icon: (availableWidgets[key] as any)?.Icon || 'mdi:puzzle',
				description: (availableWidgets[key] as any)?.Description || ''
			}));
	}

	const coreWidgets = $derived(mapKeys(widgets.coreWidgets || []));
	const customWidgets = $derived(mapKeys(widgets.customWidgets || []));
	const installedMarketplace = $derived(mapKeys(widgets.marketplaceWidgets || []));

	const remoteFiltered = $derived(
		remoteMarketplace.filter((w) => {
			const matchesSearch =
				!sidebarSearch ||
				w.name.toLowerCase().includes(sidebarSearch.toLowerCase()) ||
				(w.description || '').toLowerCase().includes(sidebarSearch.toLowerCase());
			const matchesCat = matchesCategory(w.name, selectedCategory);
			return matchesSearch && matchesCat;
		})
	);

	// ── Smart Quick-Add & Code Split-View ──

	let quickAddInput = $state('');
	let copied = $state(false);

	const inferredWidget = $derived.by<InferredWidgetResult | null>(() => {
		const raw = quickAddInput.trim();
		if (!raw) return null;
		const existingKeys = Object.keys(availableWidgets || {});
		return inferWidgetFromFieldName(raw, existingKeys);
	});

	const generatedCode = $derived(generateCollectionTypeScript(collections.active || {}, items));

	async function copyCode() {
		try {
			await navigator.clipboard.writeText(generatedCode);
			copied = true;
			toast.success('TypeScript schema copied to clipboard');
			setTimeout(() => {
				copied = false;
			}, 2000);
		} catch {
			toast.error('Failed to copy code');
		}
	}

	async function addInferredField(target: InferredWidgetResult) {
		await widgets.initialize();
		const resolvedKey = getWidgetFunction(target.widgetKey)
			? target.widgetKey
			: Object.keys(widgets.widgetFunctions || {}).find(
					(k) => k.toLowerCase() === target.widgetKey.toLowerCase()
				) || 'input';

		const existing = new SvelteSet(items.map((i) => i.db_fieldName).filter(Boolean) as string[]);
		let dbName = target.db_fieldName;
		let n = 0;
		while (existing.has(dbName)) dbName = `${target.db_fieldName}_${++n}`;

		const newDragId = generateUUID();
		const newIndex = items.length;
		dragIdsByIndex = { ...dragIdsByIndex, [newIndex]: newDragId };

		const newWidget: WidgetListItem = {
			id: newIndex + 1,
			_dragId: newDragId,
			label: target.label,
			db_fieldName: dbName,
			icon: target.icon,
			required: false,
			// New fields start untranslated; the builder's translation tab flips this per field.
			translated: false,
			widget: {
				Name: resolvedKey.charAt(0).toUpperCase() + resolvedKey.slice(1),
				key: resolvedKey,
				...target.defaults
			} as any
		};

		items = [...items, newWidget];
		updateStore();
		toast.success(`Added ${target.label} (${target.displayName})`);
	}

	async function handleQuickAdd() {
		if (!inferredWidget) return;
		const target = inferredWidget;
		quickAddInput = '';
		await addInferredField(target);
	}
</script>

{#snippet codePane(fullWidth = false)}
	<div
		class="flex min-h-0 min-w-0 flex-1 flex-col {fullWidth
			? 'w-full'
			: 'border-(--admin-border-default) lg:border-s'}"
		data-testid="collection-code-pane"
	>
		<!-- Header -->
		<div
			class="flex shrink-0 flex-wrap items-center gap-3 border-b border-surface-500/30 bg-surface-500/10 px-4 py-3 dark:border-surface-500/40 dark:bg-surface-900 sm:px-6"
		>
			<div class="flex items-center gap-2 text-sm font-semibold text-(--admin-text-muted)">
				<iconify-icon icon="mdi:code-json" width="20" class="text-tertiary-500"></iconify-icon>
				<span class="font-mono text-xs font-bold text-(--admin-text-body)">
					{builder_ts_config_path()}{(collections.active?.name || 'collection')
						.toLowerCase()
						.replace(/\s+/g, '_')}{builder_ts_ts_suffix()}
				</span>
				<span
					class="inline-flex items-center gap-1 rounded-full bg-success-500/10 px-2 py-0.5 text-[10px] font-semibold text-success-500 dark:bg-success-500/20"
				>
					<span class="h-1.5 w-1.5 rounded-full bg-success-500 animate-pulse"></span>
					{builder_ts_live_parity()}
				</span>
			</div>

			<div class="ms-auto flex items-center gap-2">
				<Button
					variant="secondary"
					size="sm"
					onclick={copyCode}
					leadingIcon={copied ? 'mdi:check' : 'mdi:content-copy'}
					data-testid="copy-ts-code-button"
				>
					{copied ? 'Copied!' : 'Copy Code'}
				</Button>
			</div>
		</div>

		<!-- Code Display Area -->
		<div
			class="min-h-0 flex-1 overflow-auto bg-surface-500/10 p-4 font-mono text-xs text-(--admin-text-body) selection:bg-tertiary-500/30 dark:selection:bg-primary-500/30"
		>
			<pre class="leading-relaxed whitespace-pre font-mono"><code>{generatedCode}</code></pre>
		</div>

		<!-- Footer -->
		<div
			class="shrink-0 border-t border-surface-500/30 bg-surface-500/10 px-4 py-2 text-[11px] text-(--admin-text-muted) dark:border-surface-500/40 dark:bg-surface-900/60 flex items-center justify-between"
		>
			<span>{builder_ts_parity_part1()} <code>{builder_ts_parity_code()}</code></span>
			<span class="font-mono text-[10px] opacity-70"
				>{items.length} {builder_ts_fields_defined()}</span
			>
		</div>
	</div>
{/snippet}

<div class="flex h-full min-h-112 w-full flex-col lg:flex-row" data-testid="collection-widgets-tab">
	{#if viewMode === 'code'}
		{@render codePane(true)}
	{:else if viewMode === 'preview'}
		<div class="flex min-h-0 min-w-0 flex-1 flex-col w-full h-full">
			<FormPreview
				{items}
				collectionName={collections.active?.name}
				collectionIcon={collections.active?.icon}
				collectionDescription={collections.active?.description}
			/>
		</div>
	{:else}
		<!-- ═══ LEFT: Field canvas (visible in canvas & split modes) ═══ -->
		<div class="flex min-h-0 min-w-0 flex-1 flex-col border-(--admin-border-default) lg:border-e">
			<!-- Header Removed -->

			<div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
				<!-- Duplicate Field Names Collision Warning Banner -->
				{#if duplicateFieldNames.size > 0}
					<div
						class="mx-auto mb-4 flex items-center justify-between gap-3 rounded-xl border border-warning-500/40 bg-warning-500/10 p-3.5 text-warning-600 dark:border-warning-500/40 dark:bg-warning-500/10 dark:text-warning-400 shadow-2xs"
						role="alert"
						data-testid="duplicate-fields-warning"
					>
						<div class="flex items-center gap-2.5">
							<iconify-icon
								icon="mdi:alert-circle-outline"
								width="22"
								class="text-warning-500 shrink-0"
							></iconify-icon>
							<div class="text-xs">
								<p class="font-bold">{builder_ts_duplicate_banner_title()}</p>
								<p class="mt-0.5 opacity-90">
									{builder_ts_duplicate_banner_body_part1()}{' '}<code
										class="font-mono font-bold text-warning-600 dark:text-warning-400"
										>"{Array.from(duplicateFieldNames).join(', ')}"</code
									>{' '}{builder_ts_duplicate_banner_body_part2()}
								</p>
							</div>
						</div>
					</div>
				{/if}

				<!-- Quick Add Bar -->
				<div
					class="mx-auto mb-4 max-w-4xl rounded-xl border border-(--admin-border-default) bg-(--admin-bg-card) p-3 shadow-2xs"
				>
					<div class="flex items-center gap-2">
						<div class="relative flex-1">
							<input
								aria-label={builder_ts_quick_add_aria()}
								type="text"
								bind:value={quickAddInput}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										e.preventDefault();
										handleQuickAdd();
									}
								}}
								placeholder={builder_ts_quick_add_placeholder()}
								class="w-full rounded-lg border border-(--admin-border-default) bg-(--admin-bg-input) px-3.5 py-2 text-xs text-(--admin-text-body) placeholder:text-(--admin-text-muted) focus:border-tertiary-500 focus:bg-(--admin-bg-input-focus) focus:outline-hidden sm:text-sm dark:focus:border-primary-500"
								data-testid="quick-add-field-input"
							/>
						</div>
						<Button
							variant="tertiary"
							class="dark:bg-primary-500 dark:text-white"
							size="sm"
							disabled={!inferredWidget}
							onclick={handleQuickAdd}
							leadingIcon="mdi:plus"
							data-testid="quick-add-field-button"
						>
							{builder_ts_add_field()}
						</Button>
					</div>
					{#if inferredWidget}
						<div class="mt-2 flex flex-wrap items-center gap-2 text-xs">
							<span class="text-(--admin-text-muted)">{builder_ts_inferred_widget()}</span>
							<span
								class="inline-flex items-center gap-1 rounded-full bg-tertiary-500/10 px-2.5 py-0.5 font-medium text-tertiary-600 dark:bg-primary-500/20 dark:text-primary-400"
							>
								<iconify-icon icon={inferredWidget.icon} width="14"></iconify-icon>
								{inferredWidget.displayName}
								<span class="opacity-60">({inferredWidget.db_fieldName})</span>
							</span>
							<span class="text-(--admin-text-muted) ms-auto hidden sm:inline"
								>{builder_ts_press_enter()}</span
							>
						</div>
					{/if}
				</div>

				<!-- Not a droppable itself: nesting it around the row droppables lit up the whole
				     list and let one release fire onDrop twice. The library's blue lines are
				     hidden here; dropLineFor() draws the only insertion line. -->
				<div
					class="mx-auto min-h-50 max-w-4xl space-y-3 rounded-xl p-1 [&_.drop-after]:after:hidden [&_.drop-before]:before:hidden"
					data-testid="widget-fields-list"
					role="list"
					aria-label={builder_ts_fields_list_aria()}
				>
					{#each items as item, index (item._dragId)}
						{@const isDuplicate = duplicateFieldNames.has(
							(item.db_fieldName || '').trim().toLowerCase()
						)}
						{@const dropLine = dropLineFor(item._dragId)}
						<div
							use:draggable={{
								container: 'widget-fields',
								dragData: { kind: 'field', dragId: item._dragId } satisfies FieldDrag,
								keyboard: true,
								handle: '.field-drag-handle'
							}}
							use:droppable={{
								container: `field:${item._dragId}`,
								callbacks: { onDrop: handleFieldDrop },
								direction: 'vertical'
							}}
							animate:flip={{ duration: flipDurationMs }}
							class="group relative"
							data-testid="widget-field-row"
							data-field-name={item.db_fieldName || ''}
							data-drag-id={item._dragId}
							role="listitem"
						>
							{#if dropLine}
								<span
									aria-hidden="true"
									class="pointer-events-none absolute inset-x-0 z-10 h-0.5 rounded-full bg-warning-500 {dropLine ===
									'before'
										? '-top-2'
										: '-bottom-2'}"
								></span>
							{/if}
							<!-- Clean, simple row layout matching config/collectionbuilder -->
							<div
								class="group flex w-full min-h-12 items-center gap-2 sm:gap-3 cursor-pointer overflow-hidden rounded border-2 {isDuplicate
									? 'border-warning-500/60 ring-1 ring-warning-500/40 bg-warning-500/10 dark:border-warning-500/60 dark:bg-warning-500/10'
									: 'border-surface-500/20 bg-(--admin-bg-card) dark:border-surface-500/30'} px-3 py-2 transition-colors hover:border-tertiary-500/30 dark:hover:border-primary-500/30"
								onclick={() => editField(item)}
								// Alt+Arrow reorder lives on the focusable button (not the outer
								// listitem div) — a11y: interactive events belong on interactive
								// elements; keyboard users reach it via the row's tab stop.
								onkeydown={(e) => {
									if (e.altKey && e.key === 'ArrowUp') {
										e.preventDefault();
										e.stopPropagation();
										moveFieldUp(index);
									} else if (e.altKey && e.key === 'ArrowDown') {
										e.preventDefault();
										e.stopPropagation();
										moveFieldDown(index);
									} else if (e.key === 'Enter') {
										editField(item);
									}
								}}
								role="button"
								tabindex="0"
							>
								<!-- Icon -->
								<div class="relative flex items-center shrink-0">
									<iconify-icon
										icon={item.icon ||
											(availableWidgets[(item.widget as any)?.key] as any)?.Icon ||
											'mdi:widgets'}
										width="24"
										class="text-tertiary-500 dark:text-primary-500"
										aria-hidden="true"
									></iconify-icon>
								</div>

								<!-- Name & Metadata -->
								<div class="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
									<div class="flex items-center gap-2 truncate">
										<span class="truncate text-sm font-semibold text-(--admin-text-body)"
											>{item.label || 'Unnamed Field'}</span
										>
										<span
											class="shrink-0 rounded bg-surface-500/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-(--admin-text-muted) uppercase dark:bg-surface-700 dark:text-(--admin-text-muted)"
										>
											{(item.widget as { key?: string })?.key ||
												(item.widget as { Name?: string })?.Name ||
												'Generic'}
										</span>
									</div>
									<div class="flex items-center gap-2">
										<span class="truncate text-[11px] font-mono text-(--admin-text-muted)">
											{item.db_fieldName || 'unnamed_field'}
										</span>
										{#if isDuplicate}
											<span
												class="flex items-center gap-1 rounded bg-warning-500/10 px-1.5 py-0.5 text-[10px] font-bold text-warning-500 border border-warning-500/30"
												title={builder_ts_duplicate_badge_title()}
												data-testid="duplicate-field-badge"
											>
												<iconify-icon icon="mdi:alert" width="12"></iconify-icon>
												{builder_ts_duplicate()}
											</span>
										{/if}
										{#if item.required}
											<span class="flex items-center text-error-500" title={builder_required()}>
												<iconify-icon icon="mdi:asterisk" width="10"></iconify-icon>
											</span>
										{/if}
									</div>
								</div>

								<!-- Actions -->
								<div class="flex shrink-0 items-center gap-0.5 sm:gap-1">
									<SystemTooltip title={builder_ts_move_up_title()}>
										<Button
											variant="transparent"
											size="sm"
											type="button"
											disabled={index === 0}
											onclick={(e: MouseEvent) => {
												e.stopPropagation();
												moveFieldUp(index);
											}}
											aria-label={`Move ${item.label || 'field'} up`}
											class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity disabled:opacity-30 hover:opacity-80"
										>
											<iconify-icon icon="mdi:arrow-up" width="18"></iconify-icon>
										</Button>
									</SystemTooltip>
									<SystemTooltip title={builder_ts_move_down_title()}>
										<Button
											variant="transparent"
											size="sm"
											type="button"
											disabled={index === items.length - 1}
											onclick={(e: MouseEvent) => {
												e.stopPropagation();
												moveFieldDown(index);
											}}
											aria-label={`Move ${item.label || 'field'} down`}
											class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity disabled:opacity-30 hover:opacity-80"
										>
											<iconify-icon icon="mdi:arrow-down" width="18"></iconify-icon>
										</Button>
									</SystemTooltip>
									<SystemTooltip title={button_edit()}>
										<Button
											variant="transparent"
											size="sm"
											type="button"
											onclick={(e: MouseEvent) => {
												e.stopPropagation();
												editField(item);
											}}
											aria-label={builder_ts_edit_field_aria()}
											class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity hover:opacity-80"
										>
											<iconify-icon
												icon="mdi:pencil"
												width="20"
												class="text-tertiary-500 dark:text-primary-500"
											></iconify-icon>
										</Button>
									</SystemTooltip>
									<SystemTooltip title={builder_duplicate()}>
										<Button
											variant="transparent"
											size="sm"
											type="button"
											onclick={(e: MouseEvent) => {
												e.stopPropagation();
												duplicateField(item);
											}}
											aria-label={builder_ts_duplicate_aria()}
											class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity hover:opacity-80"
										>
											<iconify-icon icon="mdi:content-copy" width="20"></iconify-icon>
										</Button>
									</SystemTooltip>
									<SystemTooltip title={builder_remove()}>
										<Button
											variant="transparent"
											size="sm"
											type="button"
											onclick={(e: MouseEvent) => {
												e.stopPropagation();
												deleteField(item._dragId);
											}}
											aria-label={builder_ts_remove_field_aria()}
											class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity hover:opacity-80"
										>
											<iconify-icon icon="mdi:delete" width="20" class="text-error-500"
											></iconify-icon>
										</Button>
									</SystemTooltip>
								</div>

								<!-- Drag Handle -->
								<SystemTooltip title={builder_ts_drag_reorder_title()}>
									<span
										class="field-drag-handle flex min-h-8 min-w-8 cursor-grab items-center justify-center opacity-60 active:cursor-grabbing hover:opacity-100"
										aria-hidden="true"
										onclick={(e: MouseEvent) => e.stopPropagation()}
									>
										<iconify-icon icon="mdi:drag-vertical" width="22"></iconify-icon>
									</span>
								</SystemTooltip>
							</div>
						</div>
					{/each}

					<!-- Append target: a sibling of the rows (never wrapping them), so a release
					     below the last row moves it to the end, and palette drags can drop here. -->
					{#if items.length > 0}
						<div
							use:droppable={{
								container: 'widget-fields-end',
								callbacks: { onDrop: handleFieldDrop },
								direction: 'vertical'
							}}
							class="relative h-10"
							aria-hidden="true"
						>
							{#if endZoneActive}
								<span
									class="pointer-events-none absolute inset-x-0 top-1 h-0.5 rounded-full bg-warning-500"
								></span>
							{/if}
						</div>
					{/if}

					{#if items.length === 0}
						<div
							use:droppable={{
								container: 'widget-fields-end',
								callbacks: { onDrop: handleFieldDrop },
								direction: 'vertical'
							}}
							class="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-8 text-center transition-colors {endZoneActive
								? 'border-warning-500/40 bg-warning-500/10'
								: 'border-surface-500/30 bg-surface-500/10 dark:border-surface-500/40 dark:bg-surface-900/20'}"
						>
							<div
								class="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-tertiary-500/10 text-tertiary-600 dark:bg-primary-900/20 dark:text-primary-500"
							>
								<iconify-icon icon="mdi:widgets-outline" width="32"></iconify-icon>
							</div>
							<h3 class="text-base font-bold text-(--admin-text-body)">
								{builder_ts_empty_heading()}
							</h3>
							<p class="mt-1 max-w-md text-xs text-(--admin-text-muted)">
								{builder_ts_empty_intro()}
							</p>

							<!-- Starter Presets -->
							<div class="mt-4 flex flex-wrap justify-center gap-2">
								{#each [{ name: 'title', label: 'Title', icon: 'mdi:format-title' }, { name: 'description', label: 'Description', icon: 'mdi:text-box-outline' }, { name: 'cover_image', label: 'Cover Image', icon: 'mdi:image-outline' }, { name: 'published_at', label: 'Publish Date', icon: 'mdi:calendar-clock' }, { name: 'tags', label: 'Tags', icon: 'mdi:tag-outline' }] as starter (starter.name)}
									<Button
										type="button"
										variant="outline"
										size="sm"
										onclick={() => {
											const inferred = inferWidgetFromFieldName(starter.name);
											if (inferred) addInferredField(inferred);
										}}
										class="h-auto! px-3! py-1.5! text-xs! hover:border-tertiary-500 hover:text-tertiary-600 dark:hover:border-primary-500 dark:hover:text-primary-400"
									>
										<iconify-icon
											icon={starter.icon}
											width="14"
											class="text-tertiary-500 dark:text-primary-500"
										></iconify-icon>
										+ {starter.label}
									</Button>
								{/each}
							</div>
						</div>
					{:else}
						<div
							class="flex items-center justify-between px-1 text-[11px] text-(--admin-text-muted)"
						>
							<span class="flex items-center gap-1">
								<iconify-icon icon="mdi:drag" width="14"></iconify-icon>
								{builder_ts_drag_hint()}
							</span>
							<span>{builder_ts_click_configure()}</span>
						</div>
					{/if}
				</div>
			</div>
		</div>

		{#if viewMode === 'split'}
			{@render codePane(false)}
		{:else}
			<!-- ═══ RIGHT: Palette ═══ -->
			<aside
				class="flex w-full shrink-0 flex-col border-t border-(--admin-border-default) bg-(--admin-bg-card) lg:w-80 lg:border-t-0 lg:border-s xl:w-96"
				data-testid="widget-palette"
			>
				<div
					class="shrink-0 space-y-3 border-b border-surface-500/30 p-4 dark:border-surface-500/40"
				>
					<h3
						class="flex items-center gap-2 text-sm font-bold tracking-wider text-(--admin-text-muted) uppercase dark:text-(--admin-text-muted)"
					>
						<iconify-icon
							icon="mdi:view-grid-plus-outline"
							width="18"
							class="text-tertiary-500 dark:text-primary-500"
						></iconify-icon>
						{builder_ts_available_widgets()}
					</h3>
					<FloatingInput
						bind:value={sidebarSearch}
						placeholder={builder_ts_search_placeholder()}
						icon="mdi:magnify"
						aria-label={builder_ts_search_aria()}
						inputClass="h-9 text-sm rounded"
					/>
					<!-- Category Filter Chips -->
					<div
						class="flex flex-wrap items-center gap-1.5 pt-0.5"
						role="group"
						aria-label={builder_ts_widget_category_aria()}
						data-testid="widget-category-chips"
					>
						{#each [{ id: 'all', label: 'All' }, { id: 'inputs', label: 'Inputs' }, { id: 'media', label: 'Media' }, { id: 'structure', label: 'Structure' }, { id: 'advanced', label: 'Advanced' }] as cat (cat.id)}
							<Button
								type="button"
								variant="transparent"
								size="sm"
								class="h-auto! rounded-full! px-2.5! py-0.5! text-[11px]! font-semibold! {selectedCategory ===
								cat.id
									? 'bg-tertiary-500 text-white shadow-2xs dark:bg-primary-500 dark:text-(--admin-text-body)'
									: 'bg-surface-500/10 text-(--admin-text-muted) hover:bg-surface-500/20 dark:text-(--admin-text-muted)'}"
								onclick={() => (selectedCategory = cat.id as WidgetCategory)}
								aria-pressed={selectedCategory === cat.id}
								data-testid={`category-chip-${cat.id}`}
							>
								{cat.label}
							</Button>
						{/each}
					</div>
					<p class="text-[11px] text-(--admin-text-muted)">
						{builder_ts_click_to_add()}
					</p>
				</div>

				<div class="min-h-0 flex-1 space-y-5 overflow-y-auto p-3 sm:p-4">
					{#snippet paletteSection(
						title: string,
						list: typeof coreWidgets,
						tone: 'core' | 'custom' | 'market'
					)}
						{#if list.length > 0}
							<div>
								<h4
									class="mb-2 px-1 text-[11px] font-bold tracking-wider text-(--admin-text-muted) uppercase dark:text-(--admin-text-muted)"
								>
									{title}
								</h4>
								<div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2">
									{#each list as w (w.key)}
										<!-- Native button: use:draggable must attach to the DOM node. -->
										<button
											type="button"
											use:draggable={{
												container: 'widget-palette',
												dragData: { kind: 'palette', widgetKey: w.key } satisfies PaletteDrag,
												keyboard: true
											}}
											onclick={() => addSidebarWidget(w.key)}
											data-testid={`quick-add-${w.key.toLowerCase()}`}
											aria-label={`Add ${w.label} widget`}
											class="group flex h-auto flex-col items-center justify-center gap-2 rounded-xl border border-surface-500/30 bg-(--admin-bg-card) p-3 text-center shadow-2xs transition-all hover:border-tertiary-500 hover:bg-tertiary-500/10 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 {tone ===
											'market'
												? 'hover:border-warning-500'
												: ''}"
										>
											<div
												class="flex h-10 w-10 items-center justify-center rounded-lg bg-tertiary-500/10 text-tertiary-600 dark:bg-surface-700 dark:text-primary-400 transition-colors group-hover:bg-tertiary-500 dark:group-hover:bg-primary-500 group-hover:text-white {tone ===
												'market'
													? 'bg-warning-500/10 text-warning-500 group-hover:bg-warning-500 group-hover:text-white'
													: ''}"
											>
												<iconify-icon icon={w.icon} width="22" height="22"></iconify-icon>
											</div>
											<span
												class="text-xs leading-tight font-semibold text-(--admin-text-body) group-hover:text-tertiary-600 dark:group-hover:text-primary-400"
												>{w.label}</span
											>
										</button>
									{/each}
								</div>
							</div>
						{/if}
					{/snippet}

					{@render paletteSection('Core', coreWidgets, 'core')}
					{@render paletteSection('Custom', customWidgets, 'custom')}
					{@render paletteSection('Installed from Marketplace', installedMarketplace, 'market')}

					<!-- Remote marketplace catalog -->
					<div>
						<div class="mb-2 flex items-center justify-between px-1">
							<h4 class="text-[10px] font-bold tracking-widest text-(--admin-text-muted) uppercase">
								{builder_ts_marketplace()}
							</h4>
							{#if remoteLoading}
								<span class="text-[10px] text-(--admin-text-muted)">{builder_ts_loading()}</span>
							{/if}
						</div>

						{#if remoteError}
							<p class="mb-2 px-1 text-[11px] text-warning-600 dark:text-warning-400">
								{remoteError}
							</p>
						{/if}

						{#if remoteFiltered.length > 0}
							<div class="space-y-2">
								{#each remoteFiltered as w (w.id)}
									<div
										class="rounded-lg border border-warning-500/30 bg-(--admin-bg-card) p-3 dark:border-warning-500/40"
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
													<p class="line-clamp-2 text-[10px] text-(--admin-text-muted)">
														{w.description}
													</p>
												{/if}
											</div>
										</div>
										<a
											href={`${MARKETPLACE_BROWSE}&q=${encodeURIComponent(w.name)}`}
											target="_blank"
											rel="noopener noreferrer"
											class="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-warning-600 hover:underline dark:text-warning-400"
										>
											{builder_ts_marketplace_view()}
											<iconify-icon icon="mdi:open-in-new" width="12"></iconify-icon>
										</a>
									</div>
								{/each}
							</div>
						{:else if !remoteLoading}
							<p class="px-1 text-[11px] text-(--admin-text-muted)">
								{builder_ts_no_remote()}
							</p>
						{/if}
					</div>
				</div>

				<div
					class="shrink-0 space-y-2 border-t border-surface-500/30 p-3 dark:border-surface-500/40"
				>
					<a
						href={MARKETPLACE_BROWSE}
						target="_blank"
						rel="noopener noreferrer"
						data-testid="browse-marketplace-widgets"
						class="flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-warning-500/30 bg-warning-500/10 p-3 text-sm font-semibold text-warning-600 transition-colors hover:bg-warning-500/10 dark:border-warning-500/40 dark:bg-warning-900/20 dark:text-warning-400 dark:hover:bg-warning-900/20"
					>
						<iconify-icon icon="mdi:store-outline" width="18"></iconify-icon>
						{builder_ts_browse_marketplace()}
						<iconify-icon icon="mdi:open-in-new" width="16"></iconify-icon>
					</a>
					<a
						href="/config/extensions"
						class="flex items-center justify-center gap-2 rounded-lg border border-surface-500/30 p-2 text-xs font-medium text-(--admin-text-muted) hover:bg-surface-500/10 dark:border-surface-500/40 dark:text-surface-300 dark:hover:bg-surface-800"
					>
						<iconify-icon icon="mdi:puzzle-outline" width="16"></iconify-icon>
						{builder_ts_extensions_link()}
					</a>
				</div>
			</aside>
		{/if}
	{/if}
</div>
