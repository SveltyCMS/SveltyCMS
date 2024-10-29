<!-- 
@files src/routes/(app)/config/collection/Board.svelte
@description Board component for managing nested collections. 
-->
<script lang="ts">
	// Component
	import Column from './Column.svelte';

	// Store
	import { categories } from '@stores/collectionStore';

	// Types
	import type { CategoryData } from '@src/collections/types';

	// Utils
	import { createRandomID } from '@utils/utils';

	// Svelte DND-actions
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';

	export let categoryConfig: Record<string, CategoryData>;
	export let onEditCategory: (category: { name: string; icon: string }) => void;

	interface DndItem {
		id: string;
		name: string;
		icon: string;
		isCategory: boolean;
		items?: DndItem[];
		parentId?: string;
	}

	// Convert categoryConfig to format needed for dnd-actions
	function createStructuredItems(config: Record<string, CategoryData>): DndItem[] {
		return Object.entries(config).map(([key, category]) => {
			const items: DndItem[] = [];

			if (category.subcategories) {
				Object.entries(category.subcategories).forEach(([subKey, subCategory]: [string, CategoryData]) => {
					// Check if this subcategory has its own subcategories
					if (subCategory.subcategories && Object.keys(subCategory.subcategories).length > 0) {
						// It's a category with nested items
						items.push({
							id: subKey,
							name: subCategory.name,
							icon: subCategory.icon,
							isCategory: true,
							parentId: key,
							items: Object.entries(subCategory.subcategories).map(([collKey, coll]: [string, CategoryData]) => ({
								id: collKey,
								name: coll.name,
								icon: coll.icon,
								isCategory: false,
								parentId: subKey
							}))
						});
					} else {
						// It's a direct collection
						items.push({
							id: subKey,
							name: subCategory.name,
							icon: subCategory.icon,
							isCategory: false,
							parentId: key
						});
					}
				});
			}

			return {
				id: key,
				name: category.name,
				icon: category.icon,
				isCategory: true,
				items
			};
		});
	}

	$: structuredItems = createStructuredItems(categoryConfig);

	function handleDndConsider(e: CustomEvent<{ items: DndItem[] }>) {
		structuredItems = e.detail.items;
	}

	async function handleDndFinalize(e: CustomEvent<{ items: DndItem[] }>) {
		const newItems = e.detail.items;
		const previousItems = structuredItems;

		try {
			// If an item was moved to top level, remove it from its original parent
			// but keep its own items if it's a category
			newItems.forEach((item) => {
				if (item.parentId) {
					// Find and remove from original parent
					newItems.forEach((parentItem) => {
						if (parentItem.items) {
							parentItem.items = parentItem.items.filter((i) => i.id !== item.id);
						}
					});

					// Clear the parentId as it's now a top-level item
					delete item.parentId;

					// Ensure all items in the moved category also have their parentIds updated
					if (item.items) {
						item.items = item.items.map((subItem) => ({
							...subItem,
							parentId: item.id
						}));
					}
				}
			});

			structuredItems = newItems;
			const newConfig = await convertToConfig(newItems);

			// Update local store
			categories.set(newConfig);

			// Persist to backend
			const response = await fetch('/api/save-categories', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(newConfig)
			});

			if (!response.ok) {
				throw new Error('Failed to save category changes');
			}

			// Update the parent component
			categoryConfig = newConfig;
		} catch (error) {
			console.error('Error saving category structure:', error);
			alert('Failed to save category changes. Please try again.');

			// Revert changes on error
			structuredItems = previousItems;
			const revertedConfig = await convertToConfig(previousItems);
			categories.set(revertedConfig);
			categoryConfig = revertedConfig;
		}
	}

	async function convertToConfig(items: DndItem[]): Promise<Record<string, CategoryData>> {
		const result: Record<string, CategoryData> = {};

		for (const item of items) {
			const id = item.id || (await createRandomID());
			result[id] = {
				id,
				name: item.name,
				icon: item.icon
			};

			if (item.items?.length) {
				result[id].subcategories = {};
				for (const subItem of item.items) {
					const subId = subItem.id || (await createRandomID());
					if (subItem.isCategory && subItem.items?.length) {
						// Handle nested categories
						result[id].subcategories[subId] = {
							id: subId,
							name: subItem.name,
							icon: subItem.icon,
							subcategories: {}
						};

						// Handle nested items
						for (const nestedItem of subItem.items) {
							const nestedId = nestedItem.id || (await createRandomID());
							result[id].subcategories[subId].subcategories![nestedId] = {
								id: nestedId,
								name: nestedItem.name,
								icon: nestedItem.icon
							};
						}
					} else {
						// Handle direct collections
						result[id].subcategories[subId] = {
							id: subId,
							name: subItem.name,
							icon: subItem.icon
						};
					}
				}
			}
		}

		return result;
	}

	async function handleUpdate(newItems: DndItem[]) {
		const previousItems = structuredItems;

		try {
			const newConfig = await convertToConfig(newItems);

			// Update local store
			categories.set(newConfig);

			// Persist to backend
			const response = await fetch('/api/save-categories', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(newConfig)
			});

			if (!response.ok) {
				throw new Error('Failed to save category changes');
			}

			// Update local state
			structuredItems = newItems;
			categoryConfig = newConfig;
		} catch (error) {
			console.error('Error saving category structure:', error);
			alert('Failed to save category changes. Please try again.');

			// Revert changes on error
			structuredItems = previousItems;
			const revertedConfig = await convertToConfig(previousItems);
			categories.set(revertedConfig);
			categoryConfig = revertedConfig;
		}
	}

	const flipDurationMs = 300;
</script>

<div class="mx-auto w-full max-w-7xl p-4">
	<div class="p-4" use:dndzone={{ items: structuredItems, flipDurationMs }} on:consider={handleDndConsider} on:finalize={handleDndFinalize}>
		{#each structuredItems as item (item.id)}
			<div animate:flip={{ duration: flipDurationMs }} class="mb-4">
				<Column
					name={item.name}
					icon={item.icon}
					items={item.items || []}
					onUpdate={(newItems) => {
						const updatedItems = structuredItems.map((i) => (i.id === item.id ? { ...i, items: newItems } : i));
						handleUpdate(updatedItems);
					}}
					isCategory={true}
					{onEditCategory}
				/>
			</div>
		{/each}
	</div>
</div>
