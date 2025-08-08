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
	import type { ContentNodeOperation } from '@src/content/types';

	// Simple ID generator (no need for crypto UUID)
	function generateId(): string {
		return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
	}

	// Stores
	import { collectionValue, mode } from '@src/stores/collectionStore.svelte';
	import { contentStructure } from '@root/src/stores/collectionStore.svelte';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import Board from './NestedContent/Board.svelte';
	import ModalCategory from './NestedContent/ModalCategory.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getToastStore, getModalStore, type ModalSettings, type ModalComponent } from '@skeletonlabs/skeleton';
	import type { ContentNode, DatabaseId, ISODateString } from '@root/src/databases/dbInterface';

	interface CategoryModalResponse {
		newCategoryName: string;
		newCategoryIcon: string;
	}

	interface ApiResponse {
		error?: string;
		[key: string]: any; // Allows for success, contentStructure, message
	}

	interface CollectionBuilderProps {
		data: { contentStructure: ContentNode[] };
	}

	let { data }: CollectionBuilderProps = $props();

	// `currentConfig` holds the live, mutable state of the content structure for the UI.
	// It's initialized from `data.contentStructure` and updated by DnD operations.
	let currentConfig: ContentNode[] = $state(data.contentStructure);
	// `nodesToSave` stores operations (create, update, move, rename) that need to be persisted to the backend.
	let nodesToSave = $state<Record<string, ContentNodeOperation>>({});

	// State for UI feedback
	let isLoading = $state(false);
	let apiError = $state<string | null>(null);

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	/**
	 * Opens the modal for adding or editing a category.
	 * @param existingCategory Optional ContentNode if editing an existing category.
	 */
	function modalAddCategory(existingCategory?: ContentNode): void {
		const modalComponent: ModalComponent = {
			ref: ModalCategory,
			props: {
				existingCategory
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
					if (existingCategory) {
						updateExistingCategory(existingCategory, response);
					} else {
						addNewCategory(response);
					}
					modalStore.close();
				} catch (error) {
					console.error('Error handling category modal response:', error);
					showToast('Error updating categories', 'error');
				}
			}
		};

		modalStore.trigger(modalSettings);
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
	function handleNodeUpdate(updatedNodes: ContentNode[]) {
		console.debug('Page: handleNodeUpdate received', updatedNodes);
		// Update the local `currentConfig` to reflect the UI state
		currentConfig = updatedNodes;

		// Mark all updated nodes as 'move' operations for saving.
		// The `contentManager` should handle 'move' operations by updating `parentId` and `order`.
		updatedNodes.forEach((node) => {
			nodesToSave[node._id] = {
				type: 'move',
				node: node
			};
		});
		console.debug('Nodes to save (after move):', nodesToSave);
	}

	// Handles saving all pending changes (`nodesToSave`) to the backend.
	async function handleSave() {
		const items = Object.values(nodesToSave);
		if (items.length === 0) {
			showToast('No changes to save.', 'info');
			return;
		}

		try {
			isLoading = true;
			const response = await fetch('/api/content-structure', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					action: 'updateContentStructure',
					items
				})
			});

			const result: ApiResponse = await response.json();

			if (response.ok && result.success) {
				showToast('Categories and Collections updated successfully', 'success');
				// Clear pending saves after successful API call
				nodesToSave = {};
				// Re-sync `currentConfig` with the *actual* structure returned by the server
				// This is crucial for consistency, especially after complex reorders.
				contentStructure.set(result.contentStructure);
				currentConfig = result.contentStructure;
				console.debug('API save successful. New contentStructure:', result.contentStructure);
			} else {
				// Revert currentConfig to the last known good state if save fails
				currentConfig = contentStructure.value; // Revert to the state from the store
				throw new Error(result.error || 'Failed to update categories');
			}
		} catch (error) {
			console.error('Error saving categories:', error);
			showToast(error instanceof Error ? error.message : 'Failed to save categories', 'error');
			apiError = error instanceof Error ? error.message : 'Unknown error occurred';
		} finally {
			isLoading = false;
		}
	}

	// Navigates to the new collection creation page.
	function handleAddCollectionClick(): void {
		mode.set('create');
		collectionValue.set({
			name: 'new',
			icon: '',
			description: '',
			status: 'unpublished',
			slug: '',
			fields: []
		});
		goto('/config/collectionbuilder/new');
	}

	/**
	 * Displays a toast notification.
	 * @param message The message to display.
	 * @param type The type of toast (success, info, error).
	 */
	function showToast(message: string, type: 'success' | 'info' | 'error' = 'info'): void {
		const backgrounds = {
			success: 'variant-filled-primary',
			info: 'variant-filled-tertiary',
			error: 'variant-filled-error'
		};
		toastStore.trigger({
			message: message,
			background: backgrounds[type],
			timeout: 3000,
			classes: 'border-1 !rounded-md'
		});
	}
</script>

<PageTitle name={m.collection_pagetitle()} icon="fluent-mdl2:build-definition" showBackButton={true} backUrl="/config" />

<div class="my-2 flex w-full justify-around gap-2">
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
		{m.collection_addcollection()}
	</button>

	<!-- Save Button -->
	<button type="button" onclick={handleSave} aria-label="Save" class="variant-filled-primary btn flex items-center gap-1 md:btn" disabled={isLoading}>
		{#if isLoading}
			<iconify-icon icon="eos-icons:loading" width="24" class="animate-spin text-white"></iconify-icon>
		{:else}
			<iconify-icon icon="material-symbols:save" width="24" class="text-white"></iconify-icon>
		{/if}
		<span class="hidden md:inline">{m.button_save()}</span>
	</button>
</div>

{#if apiError}
	<div class="mb-4 rounded bg-error-500/10 p-4 text-error-500" role="alert">
		{apiError}
	</div>
{/if}

<div class="max-h-[calc(100vh-65px)] overflow-auto">
	<div class="wrapper mb-2">
		<p class="mb-4 text-center dark:text-primary-500">
			{m.collection_text_description()}
		</p>

		<Board contentNodes={currentConfig ?? []} onNodeUpdate={handleNodeUpdate} onEditCategory={modalAddCategory} />
	</div>
</div>
