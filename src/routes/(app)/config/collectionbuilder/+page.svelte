<!--
 @file src/routes/(app)/config/collection/+page.svelte
 @component
 **This component sets up and displays the collection page with nested category support**

### Props:
 - `collection` {object} - Collection object

 ### Features:
 - Collection Name
 - Collection Icon
 - Collection Description
 - Collection Status
 - Collection Slug
 - Collection Description
 - Collection Permissions
 - Collection Fields
 - Collection Categories
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	// Simple ID generator (no need for crypto UUID)
	function generateId(): string {
		return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
	}

	// Logger
	import { logger } from '@utils/logger';

	// Stores
	import { collections } from '@src/stores/collectionStore.svelte';
	import { ui } from '@src/stores/UIStore.svelte';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import Board from './NestedContent/TreeViewBoard.svelte';
	import ModalCategory from './NestedContent/ModalCategory.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { type ModalSettings, type ModalComponent } from '@skeletonlabs/skeleton';
	import { showToast } from '@utils/toast';
	import { showModal } from '@utils/modalUtils';
	import type { ContentNode, DatabaseId } from '@root/src/databases/dbInterface';
	import type { ISODateString, ContentNodeOperation } from '@root/src/content/types';

	interface NodeOperation {
		type: 'create' | 'update' | 'move' | 'rename';
		node: ContentNode;
	}

	interface CategoryModalResponse {
		newCategoryName: string;
		newCategoryIcon: string;
	}

	interface ApiResponse {
		error?: string;
		success?: boolean;
		contentStructure?: ContentNode[];
		[key: string]: any; // Allows for success, contentStructure, message
	}

	interface CollectionBuilderProps {
		data: { contentStructure: ContentNode[] };
	}

	const { data }: CollectionBuilderProps = $props();

	// `currentConfig` holds the live, mutable state of the content structure for the UI.
	// It's initialized from `data.contentStructure` and updated by DnD operations.
	let currentConfig: ContentNode[] = $state([]);
	// `nodesToSave` stores operations (create, update, move, rename) that need to be persisted to the backend.
	let nodesToSave: Record<string, NodeOperation> = $state({});

	$effect(() => {
		if (data.contentStructure) {
			currentConfig = data.contentStructure;
		}
	});

	// State for UI feedback
	let isLoading = $state(false);
	let apiError: string | null = $state(null);

	/**
	 * Opens the modal for adding or editing a category.
	 * @param existingCategory Optional Partial<DndItem> if editing an existing category.
	 */
	function modalAddCategory(existingCategory?: Partial<ContentNode>): void {
		const modalComponent: ModalComponent = {
			ref: ModalCategory,
			props: {
				existingCategory: existingCategory as ContentNode | undefined
			}
		};

		const modalSettings: ModalSettings = {
			type: 'component',
			title: existingCategory ? 'Edit Category' : 'Add New Category',
			body: existingCategory ? 'Modify Category Details' : 'Enter Unique Name and an Icon for your new category column',
			component: modalComponent,
			response: async (response: CategoryModalResponse | boolean) => {
				if (!response || typeof response === 'boolean') return;

				try {
					if (existingCategory && existingCategory._id) {
						updateExistingCategory(existingCategory as ContentNode, response);
					} else {
						addNewCategory(response);
					}
				} catch (error) {
					logger.error('Error handling category modal response:', error);
					showToast('Error updating categories', 'error');
				}
			}
		};

		showModal(modalSettings);
	}

	/**
	 * Updates an existing category in `currentConfig` and marks it for saving.
	 * @param existingCategory The original category node.
	 * @param response The new data from the modal.
	 */
	function updateExistingCategory(existingCategory: ContentNode, response: CategoryModalResponse): void {
		const updatedCategory: ContentNode = {
			...existingCategory,
			name: response.newCategoryName,
			icon: response.newCategoryIcon,
			updatedAt: new Date().toISOString() as ISODateString
		};

		// Update currentConfig immutably to trigger Svelte's reactivity
		currentConfig = currentConfig.map((node) => (node._id === updatedCategory._id ? updatedCategory : node));

		// Prepare operation for saving
		if (existingCategory.name !== updatedCategory.name) {
			nodesToSave[updatedCategory._id] = {
				type: 'rename', // 'rename' specifically implies name change
				node: updatedCategory
			};
		} else {
			nodesToSave[updatedCategory._id] = {
				type: 'update', // 'update' for icon or other property changes
				node: updatedCategory
			};
		}
	}

	/**
	 * Adds a new category to `currentConfig` and marks it for saving.
	 * @param response The data for the new category from the modal.
	 */
	function addNewCategory(response: CategoryModalResponse): void {
		const newCategoryId = generateId() as DatabaseId;

		const newCategory: ContentNode = {
			_id: newCategoryId,
			name: response.newCategoryName,
			icon: response.newCategoryIcon,
			order: currentConfig.length, // Assign an initial order (can be refined later by DnD)
			translations: [], // Initialize empty, assuming structure doesn't manage translations directly
			updatedAt: new Date().toISOString() as ISODateString,
			createdAt: new Date().toISOString() as ISODateString,
			parentId: undefined, // New categories are top-level by default
			nodeType: 'category'
		};

		currentConfig = [...currentConfig, newCategory]; // Add to current config
		nodesToSave[newCategory._id] = {
			type: 'create',
			node: newCategory
		};
	}

	/**
	 * Callback from Board.svelte when nodes are reordered or moved between parents.
	 * This updates the `currentConfig` and stages nodes for saving.
	 * @param updatedNodes The complete, flattened list of ContentNodes after a DnD operation, with updated `parentId` and `order`.
	 */
	// Handles saving all pending changes (`nodesToSave`) to the backend.
	async function handleSave() {
		const allItems = Object.values(nodesToSave);
		if (allItems.length === 0) {
			showToast('No changes to save.', 'info');
			return;
		}

		try {
			isLoading = true;

			// Split operations into 'reorder' (move) and 'content updates' (create, update, rename, delete)
			// 'moves' are handled by the reorderContentStructure endpoint which uses transactions.
			// 'others' are handled by updateContentStructure.
			const moves: ContentNodeOperation[] = [];
			const others: ContentNodeOperation[] = [];

			allItems.forEach((item) => {
				if (item.type === 'move') {
					moves.push(item);
				} else {
					others.push(item);
				}
			});

			let finalStructure: ContentNode[] | null = null;

			// 1. Process content updates first (Creates must happen before reorders can reference them)
			if (others.length > 0) {
				const response = await fetch('/api/content-structure', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'updateContentStructure',
						items: others
					})
				});
				const result: ApiResponse = await response.json();
				if (!response.ok || !result.success) throw new Error(result.error || 'Failed to update content');
				if (result.contentStructure) finalStructure = result.contentStructure;
			}

			// 2. Process reorders
			if (moves.length > 0) {
				const response = await fetch('/api/content-structure', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						action: 'reorderContentStructure',
						items: moves
					})
				});
				const result: ApiResponse = await response.json();
				if (!response.ok || !result.success) throw new Error(result.error || 'Failed to reorder content');
				if (result.contentStructure) finalStructure = result.contentStructure;
			}

			showToast('Categories and Collections updated successfully', 'success');
			// Clear pending saves after successful API call
			nodesToSave = {};

			// Update local state with the final structure from server
			if (finalStructure) {
				collections.setContentStructure(finalStructure);
				currentConfig = finalStructure;
			}
			console.debug('API save successful.');
		} catch (error) {
			logger.error('Error saving categories:', error);
			showToast(error instanceof Error ? error.message : 'Failed to save categories', 'error');
			apiError = error instanceof Error ? error.message : 'Unknown error occurred';
			// Revert currentConfig to the last known good state if save fails
			currentConfig = collections.contentStructure;
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Callback from Board.svelte when nodes are reordered or moved between parents.
	 * This updates the `currentConfig` and stages nodes for saving.
	 * @param updatedNodes The complete, flattened list of ContentNodes after a DnD operation, with updated `parentId` and `order`.
	 */
	function handleNodeUpdate(updatedNodes: ContentNode[]) {
		console.debug('Page: handleNodeUpdate received', updatedNodes);
		// Update the local `currentConfig` to reflect the UI state
		currentConfig = updatedNodes;

		// Mark updated nodes for saving.
		// Preserve existing operation types (e.g. 'create') if they exist, updating only the node data.
		updatedNodes.forEach((node) => {
			const existingOp = nodesToSave[node._id];
			if (existingOp && existingOp.type !== 'move') {
				// Update the node data in the existing operation (e.g. keep 'create' but update order/parent)
				nodesToSave[node._id] = {
					...existingOp,
					node: node
				};
			} else {
				// Otherwise mark as move
				nodesToSave[node._id] = {
					type: 'move',
					node: node
				};
			}
		});
		console.debug('Nodes to save (after update):', nodesToSave);
	}

	function handleAddCollectionClick(): void {
		collections.setMode('create');
		collections.setCollectionValue({
			name: 'new',
			icon: '',
			description: '',
			status: 'unpublished',
			slug: '',
			fields: []
		});
		goto('/config/collectionbuilder/new');
	}

	import { onMount, onDestroy } from 'svelte';

	onMount(() => {
		ui.setRouteContext({ isCollectionBuilder: true });
	});

	onDestroy(() => {
		ui.setRouteContext({ isCollectionBuilder: false });
	});
</script>

<PageTitle name={m.collection_pagetitle()} icon="fluent-mdl2:build-definition" showBackButton={true} backUrl="/config">
	<div class="flex items-center gap-2">
		<!-- Add Category Button -->
		<button
			onclick={() => modalAddCategory()}
			type="button"
			aria-label="Add New Category"
			class="variant-filled-tertiary btn flex items-center gap-1 md:variant-filled-tertiary md:btn"
			disabled={isLoading}
		>
			<iconify-icon icon="bi:collection" width="18" class="text-white"></iconify-icon>
			<span class="hidden md:inline">{m.collection_addcategory()}</span>
		</button>

		<!-- Add Collection Button -->
		<button
			onclick={handleAddCollectionClick}
			type="button"
			aria-label="Add New Collection"
			class="variant-filled-surface btn flex items-center justify-between gap-1 rounded font-bold"
			disabled={isLoading}
		>
			<iconify-icon icon="material-symbols:category" width="18"></iconify-icon>
			{m.collection_add()}
		</button>

		<!-- Save Button -->
		<button
			type="button"
			onclick={handleSave}
			aria-label="Save"
			class="variant-filled-primary btn flex items-center gap-1 md:btn"
			disabled={isLoading}
		>
			{#if isLoading}
				<iconify-icon icon="eos-icons:loading" width="24" class="animate-spin text-white"></iconify-icon>
			{:else}
				<iconify-icon icon="material-symbols:save" width="24" class="text-white"></iconify-icon>
			{/if}
			<span class="hidden md:inline">{m.button_save()}</span>
		</button>
	</div>
</PageTitle>

{#if apiError}
	<div class="mb-4 rounded bg-error-500/10 p-4 text-error-500" role="alert">
		{apiError}
	</div>
{/if}

<div class="h-[calc(100vh-140px)] overflow-y-auto">
	<div class="wrapper mb-2">
		<p class="mb-4 text-center dark:text-primary-500">
			{m.collection_description()}
			<br />
			<span class="text-sm opacity-70">
				Organize your content structure by creating categories and collections. Drag and drop items to reorder them. Use categories to group related
				collections.
			</span>
		</p>

		<Board contentNodes={currentConfig ?? []} onNodeUpdate={handleNodeUpdate} onEditCategory={modalAddCategory} />
	</div>
</div>
