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
	import { goto } from '$app/navigation';
	import { page } from '$app/state';

	// Removed axios import

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import type { ISODateString } from '@root/src/content/types';
	import type { ContentNode, DatabaseId } from '@root/src/databases/dbInterface';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	// Stores
	import { setCollectionValue, setContentStructure, setMode } from '@src/stores/collectionStore.svelte';
	import { setRouteContext } from '@src/stores/UIStore.svelte.ts';
	// Skeleton
	import { toaster } from '@stores/store.svelte.ts';
	// Logger
	import { logger } from '@utils/logger';
	import { modalState } from '@utils/modalState.svelte';
	import { showConfirm } from '@utils/modalUtils';
	import ModalCategory from './NestedContent/ModalCategory.svelte';
	import TreeViewBoard from './NestedContent/TreeViewBoard.svelte';

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

	$effect(() => {
		// Only update from server data if we don't have pending changes
		// This prevents the "Save" return data from conflicting with drag operations if a save happens
		if (data.contentStructure && Object.keys(nodesToSave).length === 0) {
			currentConfig = data.contentStructure as unknown as ContentNode[];
		}
	});

	async function handleNodeUpdate(updatedNodes: ContentNode[]) {
		console.debug('[CollectionBuilder] Hierarchy updated via DnD');
		currentConfig = updatedNodes;

		// Optimization: Automatically stage all nodes as moved for consistency
		updatedNodes.forEach((node) => {
			nodesToSave[node._id.toString()] = {
				type: 'move',
				node
			};
		});
	}

	function handleDeleteNode(node: Partial<ContentNode>) {
		if (!node._id) { return; }
		showConfirm({
			title: 'Delete Item?',
			body: `Are you sure you want to delete "${node.name}"? This action cannot be undone.`,
			onConfirm: async () => {
				const formData = new FormData();
				formData.append('ids', JSON.stringify([node._id?.toString()]));
				try {
					isLoading = true;
					const response = await fetch('?/deleteCollections', {
						method: 'POST',
						body: formData
					});

					if (!response.ok) {
						throw new Error(`HTTP error! status: ${response.status}`);
					}

					const result = await response.json();
					const actionData = result.type === 'success' || result.type === 'failure' ? result.data : result;

					if (result.type === 'success' && actionData.success) {
						currentConfig = currentConfig.filter((n) => n._id.toString() !== node._id?.toString());
						toaster.success({ description: 'Item deleted successfully' });
					} else {
						throw new Error(actionData.message || 'Deletion failed');
					}
				} catch (err) {
					logger.error('Delete failed', err);
					toaster.error({ description: 'Failed to delete item' });
				} finally {
					isLoading = false;
				}
			}
		});
	}

	function handleDuplicateNode(node: Partial<ContentNode>) {
		if (!node._id) { return; }
		const original = currentConfig.find((n) => n._id.toString() === node._id?.toString());
		if (!original) { return; }

		const newId = (Math.random().toString(36).substring(2, 15) + Date.now().toString(36)) as unknown as DatabaseId;
		const newNode: ContentNode = JSON.parse(
			JSON.stringify({
				...original,
				_id: newId,
				name: `${original.name} (Copy)`,
				updatedAt: new Date().toISOString() as ISODateString,
				createdAt: new Date().toISOString() as ISODateString
			})
		);

		// Ensure path is reset or adjusted so it's not a collision
		newNode.path = `${newNode.path}_copy`;
		if (newNode.collectionDef) {
			newNode.collectionDef.name = newNode.name;
			newNode.collectionDef.path = newNode.path;
		}

		currentConfig = [...currentConfig, newNode];
		nodesToSave[newId.toString()] = { type: 'create', node: newNode };
		toaster.success({ description: 'Item duplicated. Click Save to persist change.' });
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

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			const actionData = result.type === 'success' || result.type === 'failure' ? result.data : result;

			if (result.type === 'success' && actionData.success) {
				toaster.success({ description: 'Organization updated successfully' });
				nodesToSave = {};
				if (actionData.contentStructure) {
					currentConfig = actionData.contentStructure;
					setContentStructure(currentConfig);
				}
			} else {
				throw new Error(actionData.message || 'Failed to save');
			}
		} catch (error) {
			logger.error('Error saving categories:', error);
			toaster.error({ description: 'Failed to save configuration' });
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

	function modalAddCategory(existingCategory?: Partial<ContentNode>): void {
		modalState.trigger(
			ModalCategory as any,
			{
				existingCategory: existingCategory as ContentNode | undefined,
				title: existingCategory ? 'Edit Category' : 'Add New Category',
				body: existingCategory ? 'Modify Category Details' : 'Enter Unique Name and an Icon for your new category'
			},
			async (response: CategoryModalResponse | boolean) => {
				if (!response || typeof response === 'boolean') { return; }

				if (existingCategory?._id) {
					const updated = {
						...existingCategory,
						name: response.newCategoryName,
						icon: response.newCategoryIcon,
						updatedAt: new Date().toISOString() as ISODateString
					} as ContentNode;
					currentConfig = currentConfig.map((n) => (n._id === updated._id ? updated : n));
					nodesToSave[updated._id.toString()] = { type: 'rename', node: updated };
				} else {
					const newId = Math.random().toString(36).substring(2, 15) as unknown as DatabaseId;
					const newCategory: ContentNode = {
						_id: newId,
						name: response.newCategoryName,
						icon: response.newCategoryIcon,
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

<PageTitle name={m.collection_pagetitle()} icon="fluent-mdl2:build-definition" showBackButton={true} backUrl="/config" />

<div class="mb-4 flex flex-wrap gap-2 px-4">
	<button onclick={() => modalAddCategory()} class="preset-filled-tertiary-500 btn flex items-center gap-1" disabled={isLoading}>
		<iconify-icon icon="mdi:folder-plus" width="24"></iconify-icon>
		<span class="hidden sm:inline">{m.collection_addcategory()}</span>
	</button>

	<button onclick={handleAddCollectionClick} class="preset-filled-surface-500 btn flex items-center gap-1 rounded" disabled={isLoading}>
		<iconify-icon icon="ic:round-plus" width="24"></iconify-icon>
		<span class="hidden sm:inline">{m.collection_add()}</span>
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
		<span>{m.button_save()}</span>
	</button>
</div>

<div class="max-h-[calc(100vh-120px)] overflow-auto p-4">
	<div class="mx-auto max-w-4xl">
		<p class="mb-6 text-center text-surface-600-300 dark:text-primary-500">{m.collection_description()}</p>

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
