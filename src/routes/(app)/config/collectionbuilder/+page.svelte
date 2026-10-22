<!--
@file src/routes/(app)/config/collectionbuilder/+page.svelte
@component
**Collection Builder Management Interface**

Main entry point for managing collections and categories with visual organization.
Provides drag-and-drop hierarchical organization and quick create workflows.

### Features
- **Visual Organization**: TreeView with drag-and-drop support
- **Quick Create**: Modal-based creation for categories and collections
- **Batch Operations**: Stage multiple changes before saving
- **Real-time Validation**: Prevent invalid hierarchies and duplicates
- **Undo Support**: Track pending changes before persistence

### Props
- `data.contentStructure` - Array of ContentNode objects representing current hierarchy
- `data.user` - Current authenticated user information
- `data.isAdmin` - Whether user has admin privileges

### State Management
- `currentConfig` - Working copy of content structure
- `nodesToSave` - Pending operations to persist
- `isLoading` - Global loading state for async operations

### Server Actions
- `?/saveConfig` - Persists organizational changes
- `?/deleteCollections` - Deletes collections or categories

### Keyboard Shortcuts
None (TreeView has its own keyboard navigation)

@example
<CollectionBuilder data={{ contentStructure, user, isAdmin }} />
-->
<script lang="ts">
	import { SvelteSet } from 'svelte/reactivity';
	import type { ContentNode, DatabaseId } from '@src/databases/db-interface';
	import { nowISODateString } from '@src/utils/date';
	import { generateUUID } from '@utils/native-utils';
	import { hasDuplicateSiblingName } from '@src/content';
	import { getDescendantIds } from './collectionbuilder-utils';
	import { rethrow } from '@utils/error-handling';
	import { sanitizeHtml } from '@utils/sanitize-html';
	import {
		button_save,
		builder_clear_category_aria,
		builder_clear_selection,
		builder_introspect_ingest,
		builder_note_instant,
		builder_note_layout,
		builder_quick_start,
		builder_tip_save_changes,
		builder_tip_quick_start,
		builder_tip_introspect,
		builder_tip_add_category,
		builder_tip_add_collection,
		builder_tip_save_no_changes,
		builder_unsaved_changes_part1,
		builder_unsaved_changes_part2,
		builder_unsaved_changes_save,
		collection_add,
		collection_addcategory,
		collection_description,
		collection_pagetitle
	} from '@src/paraglide/messages';
	import TreeViewBoard from '@src/routes/(app)/config/collectionbuilder/nested-content/tree-view-board.svelte';
	// Stores
	import {
		collections,
		setCollection,
		setCollectionValue,
		setDraftContentStructure,
		setContentStructure
	} from '@src/stores/collection-store.svelte';
	import { modeTransitionGuard } from '@src/stores/mode-transition-guard.svelte';
	import { useContent } from '@src/content';
	// Native UI Components
	import { toast } from '@src/stores/toast.svelte.ts';
	import { setRouteContext } from '@src/stores/ui-store.svelte.ts';
	import Button from '@components/ui/button.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import Slot from '@components/system/slot.svelte';
	import AdminCard from '@components/admin-card.svelte';
	// Logger
	import { logger } from '@utils/logger';
	import { modalState } from '@utils/modal.svelte';
	import { showConfirm } from '@utils/modal.svelte';
	import { goto, invalidate } from '$app/navigation';
	import { registerHotkey } from '@src/utils/hotkeys';
	import { onMount, untrack } from 'svelte';

	onMount(() => {
		registerHotkey(
			'mod+s',
			() => {
				if (!isLoading && Object.keys(nodesToSave).length > 0) {
					handleSave();
				}
			},
			'Save collection structure'
		);

		registerHotkey(
			'mod+n',
			() => {
				if (isLoading) return;
				const addBtn = document.querySelector<HTMLAnchorElement>(
					'[data-testid="add-collection-button"]'
				);
				if (addBtn) {
					addBtn.click();
					return;
				}
				setupNewCollection();
				// slop:suppress — keyboard-hotkey fallback navigation (no anchor target to preload)
				goto(newCollectionHref);
			},
			'New collection'
		);
	});

	import ModalCategory from './nested-content/modal-category.svelte';
	import ModalQuickStart from './nested-content/modal-quick-start.svelte';
	import ModalSchemaIngestion from './nested-content/modal-schema-ingestion.svelte';
	import EmptyState from './nested-content/empty-state.svelte';
	import { fade } from 'svelte/transition';

	interface NodeOperation {
		node: ContentNode;
		type: 'create' | 'update' | 'move' | 'rename' | 'delete';
	}

	interface CategoryModalResponse {
		newCategoryIcon: string;
		newCategoryName: string;
		newCategoryDescription?: string;
	}

	const { data } = $props();
	useContent();

	// Both values are replaced immutably so each drag produces one detached draft.
	/**
	 * Seed the draft from page data at init so the SERVER already renders the
	 * real board. Seeding it from a `$effect` (previous behaviour) made SSR emit
	 * the empty state and hydration swap in the whole board — the dominant
	 * layout shift + delay on this route.
	 */
	const initialStructure = untrack(() => (data.contentStructure as unknown as ContentNode[]) ?? []);
	let currentConfig: ContentNode[] = $state.raw(initialStructure);
	let nodesToSave: Record<string, NodeOperation> = $state.raw({});
	let isLoading = $state(false);
	let draftRevision = 0;
	/** Staged Quick-Start preset — materialized (files → DB → store) only on Save. */
	let pendingPresetId: string | null = $state(null);
	/** Staged collection duplicates — each materializes a `.ts` copy on Save. */
	let pendingDuplicates: Array<{ originalName: string; newName: string }> = $state.raw([]);
	/** Single category selected for "add collection" (only one at a time). */
	let selectedCategoryId = $state<string | null>(null);
	/** Incremented when immediate category operations intentionally adopt a server structure. */
	let treeVersion = $state(0);

	/**
	 * The visible draft is seeded from page data above. This effect only mirrors
	 * that starting structure into the shared store, once, on the client.
	 */
	let structureStoreSeeded = false;

	$effect(() => {
		const structure = data.contentStructure as unknown as ContentNode[];
		if (structureStoreSeeded || !structure) return;
		structureStoreSeeded = true;
		untrack(() => setContentStructure(structure));
	});

	$effect(() => {
		const sharedStructure = collections.contentStructure as ContentNode[];
		if (!structureStoreSeeded || !sharedStructure?.length) return;

		const hierarchySignature = (nodes: ContentNode[]) =>
			nodes
				.map((node) => `${String(node._id)}:${String(node.parentId ?? '')}:${node.order ?? 0}`)
				.sort()
				.join('|');

		if (hierarchySignature(sharedStructure) === hierarchySignature(currentConfig)) return;

		// The shared store rejects stale layout/SSE responses while a local draft is
		// pending, so a different structure here is a legitimate sidebar edit.
		currentConfig = $state.snapshot(sharedStructure) as ContentNode[];
		treeVersion++;
	});

	async function handleNodeUpdate(updatedNodes: ContentNode[]) {
		logger.debug('[CollectionBuilder] Hierarchy updated via DnD');
		const nextStructure = $state.snapshot(updatedNodes) as ContentNode[];
		draftRevision++;
		currentConfig = nextStructure;

		// Keep left sidebar (and any other contentStructure consumers) in sync immediately.
		// Previously only save/delete called setContentStructure — DnD left the sidebar stale.
		setDraftContentStructure(nextStructure);

		// Stage all nodes as one detached snapshot. The save request and visible
		// draft now refer to the same DnD revision instead of accumulating mutable
		// node references across several drag events.
		const freshOps: Record<string, NodeOperation> = {};
		for (const node of nextStructure) {
			const id = node._id.toString();
			const keepCreate = nodesToSave[id]?.type === 'create';

			// `nextStructure` is already a detached snapshot, so pending operations
			// cannot retain proxies owned by an earlier drag.
			const normalized =
				node.nodeType === 'category' && !node.source
					? { ...node, source: 'builder' as const }
					: node;

			freshOps[id] = {
				type: keepCreate ? 'create' : 'move',
				node: normalized
			};
		}
		nodesToSave = freshOps;
	}

	/**
	 * Stage deletions as `delete` ops + optimistically remove the nodes from the
	 * local draft. Nothing touches the server until the user presses Save.
	 */
	function stageDeletes(idsToDelete: string[]) {
		const idSet = new SvelteSet(idsToDelete);
		const ops: Record<string, NodeOperation> = { ...nodesToSave };
		for (const node of currentConfig) {
			const id = node._id?.toString() ?? '';
			if (idSet.has(id)) ops[id] = { type: 'delete', node };
		}
		nodesToSave = ops;
		currentConfig = currentConfig.filter((node) => !idSet.has(node._id?.toString() ?? ''));
		setDraftContentStructure(currentConfig);
		draftRevision++;
		toast.success(
			idsToDelete.length > 1
				? 'Items staged for deletion. Click Save to persist.'
				: 'Item staged for deletion. Click Save to persist.'
		);
	}

	function handleDeleteNode(node: Partial<ContentNode>) {
		const nodeId = node._id?.toString();
		if (!nodeId) {
			return;
		}

		const isCategory = node.nodeType === 'category';
		if (isCategory) {
			const idsToDelete = getDescendantIds(nodeId, currentConfig);
			const attachedCount = idsToDelete.length - 1; // exclude the category itself
			const body =
				attachedCount > 0
					? `Remove category "${node.name}" and all ${attachedCount} attached collection(s) and sub-categories? Click Save to persist. This cannot be undone.`
					: `Remove category "${node.name}"? Click Save to persist. This cannot be undone.`;

			showConfirm({
				title: 'Remove Category and Contents?',
				body,
				onConfirm: () => stageDeletes(idsToDelete)
			});
		} else {
			showConfirm({
				title: 'Remove Item?',
				body: `Remove "${node.name}"? Click Save to persist. This cannot be undone.`,
				onConfirm: () => stageDeletes([nodeId])
			});
		}
	}

	function handleDuplicateNode(node: Partial<ContentNode>) {
		if (!node._id) {
			return;
		}
		const original = currentConfig.find((n) => n._id.toString() === node._id?.toString());
		if (!original) {
			return;
		}

		const isCategory = original.nodeType === 'category';
		if (isCategory) {
			// Duplicate only the category (no attached collections)
			const now = nowISODateString();
			const newId = generateUUID() as unknown as DatabaseId;
			const baseName = (original.name || 'category').toString().replace(/\s+/g, '_');
			const newName = `${baseName}_copy`;
			const rootCount = currentConfig.filter((n) => !n.parentId).length;
			const newNode: ContentNode = {
				_id: newId,
				name: newName,
				icon: original.icon,
				path: String(newId),
				order: rootCount,
				translations: original.translations ?? [],
				description: original.description,
				nodeType: original.nodeType,
				source: original.source ?? 'builder',
				parentId: undefined,
				updatedAt: now,
				createdAt: now
			};
			currentConfig = [...currentConfig, newNode];
			setDraftContentStructure(currentConfig);
			nodesToSave = {
				...nodesToSave,
				[newNode._id?.toString() ?? '']: { type: 'create', node: newNode }
			};
			draftRevision++;
			toast.success('Category duplicated. Click Save to persist.');
			return;
		}

		// Single collection duplicate — stage as a `.ts` copy (files own existence,
		// C1). The Save button materializes the source file via `duplicateCollection`.
		const newId = generateUUID() as unknown as DatabaseId;
		const originalName = (
			original.name ||
			(original.collectionDef as { name?: string })?.name ||
			'copy'
		)
			.toString()
			.replace(/\s+/g, '_');
		const newName = `${originalName}_copy`;
		const parentId = original.parentId as DatabaseId | undefined;
		if (hasDuplicateSiblingName(currentConfig, parentId ?? undefined, newName)) {
			toast.warning(
				'A collection with this name already exists at this level. Please choose another name.'
			);
			return;
		}
		const idBasedPath = parentId != null ? `${String(parentId)}.${String(newId)}` : String(newId);

		const now = nowISODateString();
		const newNode: ContentNode = {
			_id: newId,
			name: newName,
			icon: original.icon,
			path: idBasedPath,
			order: original.order,
			translations: original.translations ?? [],
			description: original.description,
			nodeType: original.nodeType,
			source: original.source,
			parentId: parentId ?? undefined,
			updatedAt: now,
			createdAt: now,
			collectionDef: original.collectionDef
				? ({ name: newName, path: idBasedPath } as ContentNode['collectionDef'])
				: undefined
		};

		currentConfig = [...currentConfig, newNode];
		setDraftContentStructure(currentConfig);
		pendingDuplicates = [...pendingDuplicates, { originalName, newName }];
		draftRevision++;
		toast.success('Item duplicated. Click Save to persist change.');
	}

	async function handleSave() {
		const items = $state.snapshot(Object.values(nodesToSave)) as NodeOperation[];
		const presetId = pendingPresetId;
		const duplicates = $state.snapshot(pendingDuplicates) as Array<{
			originalName: string;
			newName: string;
		}>;
		if (items.length === 0 && presetId === null && duplicates.length === 0) {
			toast.info('No changes to save.');
			return;
		}

		const submittedStructure = $state.snapshot(currentConfig) as ContentNode[];
		const submittedRevision = draftRevision;

		try {
			isLoading = true;

			// 1. Materialize a staged Quick-Start preset first. Files own collection
			//    existence (C1), so preset creation is the one collection-create path
			//    that may run here — via the dedicated installer (writes `.ts` files,
			//    refreshes the engine, persists the store, then returns the tree).
			if (presetId !== null) {
				const { installTemplateCollections } = await import('./collectionbuilder.remote');
				const result = await installTemplateCollections(presetId);

				if (!('success' in result && result.success)) {
					const message =
						(result as any)?.message ??
						(result as any)?.data?.message ??
						'Failed to install template';
					logger.error('Error installing template:', message);
					toast.error(message);
					return;
				}

				pendingPresetId = null;
				const installed = (result as any).contentStructure as ContentNode[] | undefined;
				if (installed?.length) {
					currentConfig = $state.snapshot(installed) as ContentNode[];
					setDraftContentStructure(currentConfig);
					treeVersion++;
				}
				// The install persists the whole tree server-side; any staged structural
				// ops were against the pre-install draft and are superseded by it.
				nodesToSave = {};
				pendingDuplicates = [];
				await invalidate('app:content');
				toast.success((result as any).message ?? 'Template installed successfully');
				return;
			}

			// 1b. Materialize staged collection duplicates (source `.ts` copy).
			if (duplicates.length > 0) {
				const { duplicateCollection } = await import('./collectionbuilder.remote');
				let committed: ContentNode[] | undefined;
				for (const dup of duplicates) {
					const result = await duplicateCollection(dup);
					if (!('success' in result && result.success)) {
						const message =
							(result as any)?.message ??
							(result as any)?.data?.message ??
							'Failed to duplicate collection';
						logger.error('Error duplicating collection:', message);
						toast.error(message);
						return;
					}
					committed = (result as any).contentStructure as ContentNode[] | undefined;
				}
				pendingDuplicates = [];
				if (committed?.length) {
					currentConfig = $state.snapshot(committed) as ContentNode[];
					setDraftContentStructure(currentConfig);
					treeVersion++;
				}
				nodesToSave = {};
				await invalidate('app:content');
				toast.success('Collection duplicated successfully');
				return;
			}

			// 2. Flush structural ops (move / rename / delete / category-create).
			const { saveContentStructure } = await import('./collectionbuilder.remote');
			const result = await saveContentStructure(items as any);

			if ('success' in result && result.success && result.contentStructure) {
				const userChangedDraftDuringSave = draftRevision !== submittedRevision;

				if (!userChangedDraftDuringSave) {
					currentConfig = submittedStructure;
					setDraftContentStructure(submittedStructure);

					try {
						await invalidate('app:content');
					} catch (error) {
						rethrow(error);
						logger.debug('[CollectionBuilder] Post-save layout refresh failed', error);
					}

					// Layout invalidation may refresh the shared sidebar store. The
					// builder draft remains authoritative for this mounted editor.
					currentConfig = submittedStructure;
					setDraftContentStructure(submittedStructure);
					nodesToSave = {};
					toast.success('Organization updated successfully');
				} else {
					// A later drag happened while the request was in flight. The
					// submitted revision saved successfully; the newer draft remains.
					setDraftContentStructure(currentConfig);
					toast.success('Organization updated; newer changes remain unsaved.');
				}
			} else {
				const message = (result as any).message ?? 'Failed to save';
				logger.error('Error saving categories:', message);
				const isDuplicateName =
					typeof message === 'string' &&
					(message.includes('already exists at this level') ||
						message.includes('already exists in the target category'));
				if (isDuplicateName) {
					toast.warning(message);
				} else {
					toast.error(message);
				}
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			logger.error('Error saving categories:', msg);
			toast.error(msg || 'Failed to save configuration');
		} finally {
			isLoading = false;
		}
	}

	function handleSelectCategory(node: { id: string; nodeType: string }): void {
		if (node.nodeType !== 'category') return;
		// Toggle: same category clicked again  deselect; otherwise select (only one at a time)
		selectedCategoryId = selectedCategoryId === node.id ? null : node.id;
	}

	function handleClearCategorySelection(): void {
		selectedCategoryId = null;
	}

	let newCollectionHref = $derived(
		selectedCategoryId
			? `/config/collectionbuilder/new?parentId=${encodeURIComponent(selectedCategoryId)}`
			: `/config/collectionbuilder/new`
	);

	function setupNewCollection(): void {
		modeTransitionGuard.setMode('create');
		const parentId = selectedCategoryId ?? undefined;
		setCollectionValue({
			name: 'new',
			icon: '',
			description: '',
			status: 'unpublished',
			slug: '',
			fields: [],
			...(parentId && { parentId })
		});
	}

	/** Slugify name for path segment; ensure path is unique among currentConfig. */
	function uniquePathForCategory(name: string): string {
		const slug =
			name
				.trim()
				.toLowerCase()
				.replace(/\s+/g, '-')
				.replace(/[^a-z0-9-]/g, '') || 'category';
		const existingPaths = new SvelteSet(
			currentConfig.map((n) => (n.path ?? '').toLowerCase()).filter(Boolean)
		);
		let path = `/${slug}`;
		let n = 1;
		while (existingPaths.has(path.toLowerCase())) {
			path = `/${slug}-${n}`;
			n += 1;
		}
		return path;
	}

	function modalAddCategory(existingCategory: Partial<ContentNode> | undefined = undefined): void {
		modalState.trigger(
			ModalCategory as any,
			{
				existingCategory: existingCategory as ContentNode | undefined,
				title: existingCategory ? 'Edit Category' : 'Add New Category',
				body: existingCategory
					? 'Modify Category Details'
					: 'Enter a name and icon for your new category',
				size: 'xl'
			},
			async (
				response: CategoryModalResponse | boolean | { __categoryDeleted: true; categoryId: string }
			) => {
				// User cancelled
				if (!response || typeof response === 'boolean') {
					return;
				}

				// Deletion is staged by the modal; stage the cascade here too.
				if (typeof response === 'object' && '__categoryDeleted' in response) {
					stageDeletes(getDescendantIds(response.categoryId, currentConfig));
					return;
				}

				const form = response as CategoryModalResponse;
				const nameTrimmed = form.newCategoryName.trim();
				const icon = form.newCategoryIcon || 'mdi:folder-outline';

				if (existingCategory?._id) {
					// Edit existing category — staged as a rename (no immediate save).
					const updated = {
						...existingCategory,
						name: form.newCategoryName,
						icon,
						description:
							form.newCategoryDescription ?? (existingCategory as any)?.description ?? '',
						updatedAt: nowISODateString()
					} as ContentNode;

					currentConfig = currentConfig.map((node) =>
						node._id?.toString() === updated._id?.toString() ? updated : node
					);
					setDraftContentStructure(currentConfig);
					nodesToSave = {
						...nodesToSave,
						[updated._id?.toString() ?? '']: { type: 'rename', node: updated }
					};
					draftRevision++;
					toast.success(`Category "${nameTrimmed}" staged. Click Save to persist.`);
				} else {
					// Create new category — staged as a create (no immediate save).
					const newId = generateUUID() as unknown as DatabaseId;
					const path = uniquePathForCategory(form.newCategoryName);
					const newCategory: ContentNode = {
						_id: newId,
						name: form.newCategoryName,
						icon,
						path,
						order: currentConfig.length,
						translations: [],
						description: form.newCategoryDescription ?? '',
						updatedAt: nowISODateString(),
						createdAt: nowISODateString(),
						parentId: undefined,
						nodeType: 'category',
						source: 'builder'
					};

					currentConfig = [...currentConfig, newCategory];
					setDraftContentStructure(currentConfig);
					nodesToSave = {
						...nodesToSave,
						[newId.toString()]: { type: 'create', node: newCategory }
					};
					draftRevision++;
					toast.success(`Category "${nameTrimmed}" staged. Click Save to persist.`);
				}
			}
		);
	}

	function modalQuickStart(): void {
		modalState.trigger(
			ModalQuickStart as any,
			{
				title: 'Quick-Start Templates',
				size: 'xl'
			},
			async (response: { presetId: string } | null) => {
				if (!response?.presetId) return;

				const { PRESETS } = await import('@src/routes/setup/presets');
				const preset = PRESETS.find((p) => p.id === response.presetId);
				if (!preset?.collections?.length) return;

				// Stage the preset (no server write) and preview its collections in
				// the board. The Save button is the single commit point.
				pendingPresetId = response.presetId;
				const now = nowISODateString();
				const preview: ContentNode[] = preset.collections.map((col, i) => ({
					_id: `preset:${col.name}` as unknown as DatabaseId,
					name: col.name,
					icon: col.icon,
					path: `/collection/${col.name}`,
					order: currentConfig.length + i,
					translations: [],
					description: col.description,
					nodeType: 'collection',
					source: 'builder',
					updatedAt: now,
					createdAt: now
				}));

				currentConfig = [...currentConfig, ...preview];
				setDraftContentStructure(currentConfig);
				treeVersion++;
				toast.success(
					`Template staged. Click Save to create ${preset.collections.length} collection(s).`
				);
			}
		);
	}

	function modalIntrospectSchema(): void {
		modalState.trigger(
			ModalSchemaIngestion as any,
			{
				title: 'Schema Ingestion & Database Introspection',
				size: 'xl'
			},
			async (response: { schema: import('./schema-ingestion').ParsedSchemaResult } | null) => {
				if (!response || !response.schema) return;
				const { schema } = response;
				// Pre-populate collection in collection store
				setCollection({
					name: schema.name,
					slug: schema.slug,
					icon: schema.icon || 'bi:collection',
					status: 'unpublish',
					description: `Auto-generated from schema ingestion (${schema.fields.length} fields)`,
					fields: schema.fields.map((f, i) => ({
						id: i + 1,
						label: f.label,
						db_fieldName: f.db_fieldName,
						required: !!f.required,
						widget: {
							Name: f.widgetKey.charAt(0).toUpperCase() + f.widgetKey.slice(1),
							key: f.widgetKey,
							...f.defaults
						}
					}))
				} as any);
				toast.success(`Schema ingested: ${schema.name} (${schema.fields.length} fields)`);
				// slop:suppress — post-action redirect after schema-ingestion modal completes
				goto(newCollectionHref);
			}
		);
	}

	$effect(() => {
		untrack(() => {
			setRouteContext({ isCollectionBuilder: true });
		});
		return () => {
			untrack(() => {
				setRouteContext({ isCollectionBuilder: false });
			});
		};
	});
</script>

<AdminPageShell
	title={collection_pagetitle()}
	icon="mdi:database-cog-outline"
	showBackButton={true}
	backUrl="/config"
	titleBorderless={true}
>
	{#snippet actions()}
		<Button
			variant="primary"
			data-testid="save-structure-button"
			onclick={handleSave}
			disabled={isLoading ||
				(pendingPresetId === null &&
					pendingDuplicates.length === 0 &&
					Object.keys(nodesToSave).length === 0)}
			title={pendingPresetId === null &&
			pendingDuplicates.length === 0 &&
			Object.keys(nodesToSave).length === 0
				? builder_tip_save_no_changes()
				: builder_tip_save_changes()}
			aria-keyshortcuts="mod+s"
			size="md"
			class="flex items-center gap-1.5 px-4"
		>
			{#if isLoading}
				<iconify-icon icon="mdi:loading" width="20" class="animate-spin"></iconify-icon>
			{:else}
				<iconify-icon icon="mdi:content-save" width="20"></iconify-icon>
			{/if}
			<span>{button_save()}</span>
		</Button>
	{/snippet}

	{#if currentConfig.length > 0}
		<AdminCard class="p-6 border border-(--admin-border-default) backdrop-blur-md shadow-xs">
			<div class="mb-4 flex flex-wrap justify-center gap-2" in:fade={{ duration: 300 }}>
				<SystemTooltip title={builder_tip_quick_start()} role={null} tabindex={null}>
					<Button
						onclick={() => modalQuickStart()}
						variant="warning"
						size="lg"
						class="group whitespace-nowrap"
						disabled={isLoading}
					>
						<iconify-icon
							icon="mdi:magic-staff"
							width="24"
							class="transition-transform group-hover:rotate-12"
						></iconify-icon>
						<span>{builder_quick_start()}</span>
					</Button>
				</SystemTooltip>

				<SystemTooltip title={builder_tip_introspect()} role={null} tabindex={null}>
					<Button
						onclick={() => modalIntrospectSchema()}
						variant="success"
						size="lg"
						class="group whitespace-nowrap"
						disabled={isLoading}
						data-testid="introspect-schema-button"
					>
						<iconify-icon
							icon="mdi:database-arrow-right"
							width="24"
							class="transition-transform group-hover:scale-110"
						></iconify-icon>
						<span>{builder_introspect_ingest()}</span>
					</Button>
				</SystemTooltip>

				<SystemTooltip title={builder_tip_add_category()} role={null} tabindex={null}>
					<Button
						onclick={() => modalAddCategory()}
						variant="tertiary"
						size="lg"
						class="group whitespace-nowrap"
						disabled={isLoading}
						data-testid="add-category-button"
					>
						<iconify-icon
							icon="mdi:folder-plus"
							width="24"
							class="transition-transform group-hover:scale-110"
						></iconify-icon>
						<span>{collection_addcategory()}</span>
					</Button>
				</SystemTooltip>

				<SystemTooltip title={builder_tip_add_collection()} role={null} tabindex={null}>
					<Button
						href={newCollectionHref}
						data-preload="hover"
						onclick={setupNewCollection}
						variant="error"
						size="lg"
						class="group whitespace-nowrap"
						disabled={isLoading}
						data-testid="add-collection-button"
						aria-keyshortcuts="Mod+N"
					>
						<iconify-icon
							icon="ic:round-plus"
							width="24"
							class="transition-transform group-hover:rotate-90"
						></iconify-icon>
						<span>{collection_add()}</span>
					</Button>
				</SystemTooltip>

				{#if selectedCategoryId}
					<Button
						type="button"
						onclick={handleClearCategorySelection}
						variant="ghost"
						class="flex items-center gap-1 text-(--admin-text-muted)"
						disabled={isLoading}
						aria-label={builder_clear_category_aria()}
					>
						<iconify-icon icon="mdi:close-circle-outline" width="24"></iconify-icon>
						<span class="hidden sm:inline">{builder_clear_selection()}</span>
					</Button>
				{/if}
			</div>

			<p class="text-center" role="note">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html sanitizeHtml(builder_note_instant())}<br />
				<!-- eslint-disable-next-line svelte/no-at-html-tags -->
				{@html sanitizeHtml(builder_note_layout())}
			</p>

			<div class="max-h-[calc(100vh-120px)] overflow-auto" data-testid="collection-builder-board">
				<div class="mx-auto w-full max-w-screen-2xl">
					{#if pendingPresetId !== null || pendingDuplicates.length > 0 || Object.keys(nodesToSave).length > 0}
						<div
							class="sticky top-0 z-50 mb-4 mt-0 rounded border border-warning-500/30 bg-warning-500/10 px-4 py-3 text-center text-sm font-medium text-warning-600 shadow-sm dark:text-warning-400"
							role="status"
							aria-live="polite"
						>
							{builder_unsaved_changes_part1()}{' '}<strong>{builder_unsaved_changes_save()}</strong
							>{' '}
							{builder_unsaved_changes_part2()}
						</div>
					{/if}
					<p class="mb-6 text-center text-tertiary-600 dark:text-primary-500">
						{collection_description()}
					</p>

					<TreeViewBoard
						contentNodes={currentConfig}
						structureKey={treeVersion}
						onNodeUpdate={handleNodeUpdate}
						onEditCategory={modalAddCategory}
						onDeleteNode={handleDeleteNode}
						onDuplicateNode={handleDuplicateNode}
						{selectedCategoryId}
						onSelectCategory={handleSelectCategory}
					/>
				</div>
			</div>
		</AdminCard>
	{:else}
		<EmptyState
			onAddCollection={setupNewCollection}
			{newCollectionHref}
			onAddCategory={() => modalAddCategory()}
			onQuickStart={modalQuickStart}
		/>
	{/if}

	<Slot name="collection_builder" />
</AdminPageShell>
