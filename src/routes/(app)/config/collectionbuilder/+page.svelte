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
	import { collection_pagetitle, collection_addcategory, collection_add, button_save, collection_description } from '@src/paraglide/messages';
	import PageTitle from '@src/components/page-title.svelte';
	import TreeViewBoard from '@src/routes/(app)/config/collectionbuilder/nested-content/tree-view-board.svelte';

	import type { ISODateString } from '@root/src/content/types';
	import type { ContentNode, DatabaseId } from '@root/src/databases/db-interface';
	// Stores
	import { setCollectionValue, setContentStructure, setMode } from '@src/stores/collection-store.svelte';
	// Skeleton
	import { toaster } from '@src/stores/store.svelte.ts';
	import { setRouteContext } from '@src/stores/ui-store.svelte.ts';
	// Logger
	import { logger } from '@utils/logger';
	import { modalState } from '@utils/modal-state.svelte';
	import { showConfirm } from '@utils/modal-utils';
	import { deserialize } from '$app/forms';
	import { afterNavigate, goto, invalidate } from '$app/navigation';
	import { page } from '$app/state';

	import ModalCategory from './nested-content/modal-category.svelte';

	interface NodeOperation {
		node: ContentNode;
		type: 'create' | 'update' | 'move' | 'rename';
	}

	interface CategoryModalResponse {
		newCategoryIcon: string;
		newCategoryName: string;
	}

	const { data } = $props();

	let currentConfig: ContentNode[] = $state([]);
	let nodesToSave: Record<string, NodeOperation> = $state({});
	let isLoading = $state(false);
	/** When true, next effect run must not overwrite currentConfig with data (we just applied save response). */
	let skipNextSyncFromData = false;
	/** Allow one sync from data when we land on the page; reset on navigate to avoid effect_update_depth_exceeded. */
	let allowSyncFromData = $state(true);

	afterNavigate(() => {
		if (page.url.pathname.startsWith('/config/collectionbuilder') && !page.url.pathname.includes('/edit')) {
			allowSyncFromData = true;
		}
	});

	$effect(() => {
		if (!allowSyncFromData || !data.contentStructure || Object.keys(nodesToSave).length > 0) return;
		if (skipNextSyncFromData) {
			skipNextSyncFromData = false;
			return;
		}
		allowSyncFromData = false;
		const structure = data.contentStructure as unknown as ContentNode[];
		currentConfig = structure;

		// Keep sidebar in sync: it reads from contentStructure store, so update it when we load fresh data from DB
		setContentStructure(structure);
	});

	async function handleNodeUpdate(updatedNodes: ContentNode[]) {
		console.debug('[CollectionBuilder] Hierarchy updated via DnD');
		currentConfig = updatedNodes;

		// Stage all nodes: keep existing 'create' so duplicated collections get their files created on save
		updatedNodes.forEach((node) => {
			const id = node._id.toString();
			const existing = nodesToSave[id];
			const keepCreate = existing?.type === 'create';
			nodesToSave[id] = {
				type: keepCreate ? 'create' : 'move',
				node
			};
		});
	}

	/** Collect category id and all descendant node ids from flat list (for category delete). */
	function getDescendantIds(categoryId: string, flat: ContentNode[]): string[] {
		const idSet = new Set<string>();
		const add = (id: string) => {
			if (idSet.has(id)) return;
			idSet.add(id);
			flat.filter((n) => n.parentId?.toString() === id).forEach((n) => add(n._id?.toString() ?? ''));
		};
		add(categoryId);
		return Array.from(idSet);
	}

	async function doDelete(idsToDelete: string[]) {
		const formData = new FormData();
		formData.append('ids', JSON.stringify(idsToDelete));
		const response = await fetch('?/deleteCollections', {
			method: 'POST',
			body: formData
		});

		const text = await response.text();
		const result = text
			? (deserialize(text) as {
					type?: string;
					data?: { success?: boolean; message?: string; contentStructure?: ContentNode[] };
					error?: { message?: string };
				})
			: {};
		const payload = (result.type === 'success' || result.type === 'failure' ? result.data : result) as
			| { success?: boolean; message?: string; contentStructure?: ContentNode[] }
			| undefined;
		const message = result.type === 'error' ? (result.error?.message ?? 'Server error') : (payload?.message ?? 'Deletion failed');

		if (!response.ok) {
			logger.error('Delete failed', message);
			toaster.error({ description: message });
			return;
		}

		if ((result.type === 'success' && payload?.success) || payload?.success === true) {
			if (payload?.contentStructure && Array.isArray(payload.contentStructure)) {
				currentConfig = payload.contentStructure;
				setContentStructure(payload.contentStructure);
			} else {
				const idSet = new Set(idsToDelete);
				currentConfig = currentConfig.filter((n) => !idSet.has(n._id?.toString() ?? ''));
				setContentStructure(currentConfig);
			}
			// Invalidate layout so edit/create page sidebar gets fresh structure (no deleted items)
			await invalidate('app:content');
			toaster.success({ description: idsToDelete.length > 1 ? 'Category and attached items deleted' : 'Item deleted successfully' });
		} else {
			logger.error('Delete failed', message);
			toaster.error({ description: message });
		}
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
					? `Delete category "${node.name}" and all ${attachedCount} attached collection(s) and sub-categories? This action cannot be undone.`
					: `Delete category "${node.name}"? This action cannot be undone.`;

			showConfirm({
				title: 'Delete Category and Contents?',
				body,
				onConfirm: async () => {
					try {
						isLoading = true;
						await doDelete(idsToDelete);
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						logger.error('Delete failed', msg);
						toaster.error({ description: msg || 'Failed to delete' });
					} finally {
						isLoading = false;
					}
				}
			});
		} else {
			showConfirm({
				title: 'Delete Item?',
				body: `Are you sure you want to delete "${node.name}"? This action cannot be undone.`,
				onConfirm: async () => {
					try {
						isLoading = true;
						await doDelete([nodeId]);
					} catch (err) {
						const msg = err instanceof Error ? err.message : String(err);
						logger.error('Delete failed', msg);
						toaster.error({ description: msg || 'Failed to delete item' });
					} finally {
						isLoading = false;
					}
				}
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
			const now = new Date().toISOString() as ISODateString;
			const newId = (Math.random().toString(36).substring(2, 15) + Date.now().toString(36)) as unknown as DatabaseId;
			const baseName = (original.name || 'category').toString().replace(/\s+/g, '_');
			const newName = `${baseName}_copy`;
			const rootCount = currentConfig.filter((n) => !n.parentId).length;
			const newNode: ContentNode = {
				...JSON.parse(JSON.stringify(original)),
				_id: newId,
				name: newName,
				parentId: undefined,
				path: String(newId),
				order: rootCount,
				updatedAt: now,
				createdAt: now
			};
			currentConfig = [...currentConfig, newNode];
			nodesToSave[newNode._id?.toString() ?? ''] = { type: 'create', node: newNode };
			toaster.success({
				description: 'Category duplicated. Click Save to persist.'
			});
			return;
		}

		// Single collection duplicate — use id-based path so DB and refresh keep stable path (not name-based)
		const newId = (Math.random().toString(36).substring(2, 15) + Date.now().toString(36)) as unknown as DatabaseId;
		const baseName = (original.name || (original.collectionDef as { name?: string })?.name || 'copy').toString().replace(/\s+/g, '_');
		const newName = `${baseName}_copy`;
		const parentId = original.parentId as DatabaseId | undefined;
		const idBasedPath = parentId != null ? `${String(parentId)}.${String(newId)}` : String(newId);

		const newNode: ContentNode = JSON.parse(
			JSON.stringify({
				...original,
				_id: newId,
				name: newName,
				parentId: parentId ?? undefined,
				path: idBasedPath,
				slug: undefined,
				updatedAt: new Date().toISOString() as ISODateString,
				createdAt: new Date().toISOString() as ISODateString
			})
		);

		if (newNode.collectionDef) {
			(newNode.collectionDef as { name?: string; path?: string }).name = newName;
			(newNode.collectionDef as { name?: string; path?: string }).path = newNode.path;
		}

		currentConfig = [...currentConfig, newNode];
		nodesToSave[newId.toString()] = { type: 'create', node: newNode };
		toaster.success({
			description: 'Item duplicated. Click Save to persist change.'
		});
	}

	async function handleSave() {
		const items = Object.values(nodesToSave);
		if (items.length === 0) {
			toaster.info({ description: 'No changes to save.' });
			return;
		}

		try {
			isLoading = true;
			const formData = new FormData();
			formData.append('items', JSON.stringify(items));

			const response = await fetch('?/saveConfig', {
				method: 'POST',
				body: formData
			});

			const text = await response.text();
			let result: {
				type?: string;
				data?: { success?: boolean; contentStructure?: unknown; message?: string };
				error?: { message?: string };
			};
			try {
				result = text ? (deserialize(text) as typeof result) : {};
			} catch {
				logger.error('Error saving categories: response was not valid', { status: response.status, body: text.slice(0, 200) });
				toaster.error({ description: response.ok ? 'Invalid server response' : `Save failed (${response.status})` });
				return;
			}

			const payload: { success?: boolean; contentStructure?: unknown; message?: string } =
				result.type === 'success' || result.type === 'failure' ? ((result.data as typeof payload) ?? {}) : ((result as typeof payload) ?? {});

			const message = result.type === 'error' ? (result.error?.message ?? 'Server error') : (payload?.message ?? 'Failed to save');

			if (!response.ok) {
				logger.error('Error saving categories:', message);
				toaster.error({ description: message });
				return;
			}

			const isSuccess = (result.type === 'success' && payload?.success) || (payload?.success === true && payload?.contentStructure != null);
			if (isSuccess) {
				toaster.success({ description: 'Organization updated successfully' });
				if (payload?.contentStructure) {
					currentConfig = payload.contentStructure as ContentNode[];
					setContentStructure(currentConfig);
				}
				skipNextSyncFromData = true;
				nodesToSave = {};
				await invalidate('app:content');
			} else {
				logger.error('Error saving categories:', message);
				toaster.error({ description: message });
			}
		} catch (error) {
			const msg = error instanceof Error ? error.message : String(error);
			logger.error('Error saving categories:', msg);
			toaster.error({ description: msg || 'Failed to save configuration' });
		} finally {
			isLoading = false;
		}
	}

	function handleAddCollectionClick(): void {
		setMode('create');
		setCollectionValue({
			name: 'new',
			icon: '',
			description: '',
			status: 'unpublished',
			slug: '',
			fields: []
		});
		goto('/config/collectionbuilder/new');
	}

	/** Slugify name for path segment; ensure path is unique among currentConfig. */
	function uniquePathForCategory(name: string): string {
		const slug =
			name
				.trim()
				.toLowerCase()
				.replace(/\s+/g, '-')
				.replace(/[^a-z0-9-]/g, '') || 'category';
		const existingPaths = new Set(currentConfig.map((n) => (n.path ?? '').toLowerCase()).filter(Boolean));
		let path = `/${slug}`;
		let n = 1;
		while (existingPaths.has(path.toLowerCase())) {
			path = `/${slug}-${n}`;
			n += 1;
		}
		return path;
	}

	function modalAddCategory(existingCategory?: Partial<ContentNode>): void {
		modalState.trigger(
			ModalCategory as any,
			{
				existingCategory: existingCategory as ContentNode | undefined,
				title: existingCategory ? 'Edit Category' : 'Add New Category',
				body: existingCategory ? 'Modify Category Details' : 'Enter Unique Name and an Icon for your new category'
			},
			async (response: CategoryModalResponse | boolean | { __categoryDeleted: true; contentStructure: ContentNode[] }) => {
				if (!response || typeof response === 'boolean') {
					return;
				}
				if (typeof response === 'object' && '__categoryDeleted' in response && response.contentStructure) {
					currentConfig = response.contentStructure;
					return;
				}
				const form = response as CategoryModalResponse;

				if (existingCategory?._id) {
					const updated = {
						...existingCategory,
						name: form.newCategoryName,
						icon: form.newCategoryIcon,
						updatedAt: new Date().toISOString() as ISODateString
					} as ContentNode;
					currentConfig = currentConfig.map((n) => (n._id === updated._id ? updated : n));
					nodesToSave[updated._id.toString()] = { type: 'rename', node: updated };
				} else {
					const newId = Math.random().toString(36).substring(2, 15) as unknown as DatabaseId;
					const path = uniquePathForCategory(form.newCategoryName);
					const newCategory: ContentNode = {
						_id: newId,
						name: form.newCategoryName,
						icon: form.newCategoryIcon,
						path,
						order: currentConfig.length,
						translations: [],
						updatedAt: new Date().toISOString() as ISODateString,
						createdAt: new Date().toISOString() as ISODateString,
						parentId: undefined,
						nodeType: 'category'
					};
					currentConfig = [...currentConfig, newCategory];
					nodesToSave[newId.toString()] = { type: 'create', node: newCategory };
				}
			}
		);
	}

	$effect(() => {
		setRouteContext({ isCollectionBuilder: true });
		return () => {
			if (!page.url.pathname.includes('/config/collectionbuilder')) {
				setRouteContext({ isCollectionBuilder: false });
			}
		};
	});
</script>

<PageTitle name={collection_pagetitle()} icon="fluent-mdl2:build-definition" showBackButton={true} backUrl="/config" />

<div class="mb-4 flex flex-wrap gap-2 px-4">
	<button onclick={() => modalAddCategory()} class="preset-filled-tertiary-500 btn flex items-center gap-1" disabled={isLoading}>
		<iconify-icon icon="mdi:folder-plus" width="24"></iconify-icon>
		<span class="hidden sm:inline">{collection_addcategory()}</span>
	</button>

	<button onclick={handleAddCollectionClick} class="preset-filled-surface-500 btn flex items-center gap-1 rounded" disabled={isLoading}>
		<iconify-icon icon="ic:round-plus" width="24"></iconify-icon>
		<span class="hidden sm:inline">{collection_add()}</span>
	</button>

	<button
		onclick={handleSave}
		class="preset-filled-primary-500 btn flex items-center gap-1"
		disabled={isLoading || Object.keys(nodesToSave).length === 0}
	>
		{#if isLoading}
			<iconify-icon icon="mdi:loading" width="24" class="animate-spin"></iconify-icon>
		{:else}
			<iconify-icon icon="mdi:content-save" width="24"></iconify-icon>
		{/if}
		<span>{button_save()}</span>
	</button>
</div>

<div class="max-h-[calc(100vh-120px)] overflow-auto p-4">
	<div class="mx-auto max-w-6xl">
		<p class="mb-6 text-center text-surface-600-300 dark:text-primary-500">{collection_description()}</p>

		<TreeViewBoard
			contentNodes={currentConfig}
			onNodeUpdate={handleNodeUpdate}
			onEditCategory={modalAddCategory}
			onDeleteNode={handleDeleteNode}
			onDuplicateNode={handleDuplicateNode}
		/>

		{#if Object.keys(nodesToSave).length > 0}
			<div class="mt-4 rounded-lg bg-warning-500/10 p-3 text-center text-sm text-warning-600">
				You have unsaved organizational changes. Click <strong>Save</strong> to persist.
			</div>
		{/if}
	</div>
</div>
