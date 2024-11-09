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
	import { dndzone, type DndEvent } from 'svelte-dnd-action';

	interface Props {
		categoryConfig: Record<string, CategoryData>;
		onEditCategory: (category: { name: string; icon: string }) => void;
	}

	interface DndItem {
		id: string;
		name: string;
		icon: string;
		isCategory: boolean;
		isCollection?: boolean;
		items?: DndItem[];
	}

	let { categoryConfig = $bindable(), onEditCategory }: Props = $props();

	// State variables
	let structuredItems = $state<DndItem[]>([]);
	let isDragging = $state(false);
	let dragError = $state<string | null>(null);

	// Convert categoryConfig to DndItems when it changes
	$effect(() => {
		try {
			structuredItems = createStructuredItems(categoryConfig);
			dragError = null;
		} catch (error) {
			console.error('Error creating structured items:', error);
			dragError = error instanceof Error ? error.message : 'Error creating structured items';
		}
	});

	// Convert categoryConfig to format needed for dnd-actions
	function createStructuredItems(config: Record<string, CategoryData>): DndItem[] {
		return Object.entries(config).map(([key, category]) => {
			const items: DndItem[] = [];

			if (category.subcategories) {
				Object.entries(category.subcategories).forEach(([subKey, subCategory]: [string, CategoryData]) => {
					if (subCategory.isCollection) {
						// It's a collection
						items.push({
							id: subCategory.id || subKey,
							name: subCategory.name,
							icon: subCategory.icon,
							isCategory: false,
							isCollection: true
						});
					} else if (subCategory.subcategories && Object.keys(subCategory.subcategories).length > 0) {
						// It's a category with nested items
						items.push({
							id: subCategory.id || subKey,
							name: subCategory.name,
							icon: subCategory.icon,
							isCategory: true,
							isCollection: false,
							items: Object.entries(subCategory.subcategories).map(([collKey, coll]: [string, CategoryData]) => ({
								id: coll.id || collKey,
								name: coll.name,
								icon: coll.icon,
								isCategory: !coll.isCollection,
								isCollection: coll.isCollection
							}))
						});
					} else {
						// It's an empty category
						items.push({
							id: subCategory.id || subKey,
							name: subCategory.name,
							icon: subCategory.icon,
							isCategory: true,
							isCollection: false,
							items: []
						});
					}
				});
			}

			return {
				id: category.id || key,
				name: category.name,
				icon: category.icon,
				isCategory: true,
				isCollection: false,
				items
			};
		});
	}

	function handleDndConsider(e: CustomEvent<DndEvent<DndItem>>) {
		isDragging = true;
		try {
			structuredItems = e.detail.items;
			dragError = null;
		} catch (error) {
			console.error('Error handling DnD consider:', error);
			dragError = error instanceof Error ? error.message : 'Error handling drag operation';
		}
	}

	function handleDndFinalize(e: CustomEvent<DndEvent<DndItem>>) {
		try {
			structuredItems = e.detail.items;
			const newConfig = convertToConfig(structuredItems);
			categories.set(newConfig);
			categoryConfig = newConfig;
			dragError = null;
		} catch (error) {
			console.error('Error handling DnD finalize:', error);
			dragError = error instanceof Error ? error.message : 'Error finalizing drag operation';
		} finally {
			isDragging = false;
		}
	}

	function convertToConfig(items: DndItem[]): Record<string, CategoryData> {
		const result: Record<string, CategoryData> = {};

		items.forEach((item) => {
			// Create base category/collection
			result[item.id] = {
				id: item.id,
				name: item.name,
				icon: item.icon,
				isCollection: item.isCollection ?? false,
				subcategories: {}
			};

			// Handle subcategories and collections
			if (item.items && item.items.length > 0) {
				item.items.forEach((subItem) => {
					const subcategories = result[item.id].subcategories!;

					if (subItem.isCategory && subItem.items && subItem.items.length > 0) {
						// Handle nested categories
						subcategories[subItem.id] = {
							id: subItem.id,
							name: subItem.name,
							icon: subItem.icon,
							isCollection: subItem.isCollection ?? false,
							subcategories: {}
						};

						// Handle nested items
						subItem.items.forEach((nestedItem) => {
							const nestedSubcategories = subcategories[subItem.id].subcategories!;
							nestedSubcategories[nestedItem.id] = {
								id: nestedItem.id,
								name: nestedItem.name,
								icon: nestedItem.icon,
								isCollection: nestedItem.isCollection ?? false
							};
						});
					} else {
						// Handle direct collections or empty categories
						subcategories[subItem.id] = {
							id: subItem.id,
							name: subItem.name,
							icon: subItem.icon,
							isCollection: subItem.isCollection ?? false,
							...(subItem.isCategory ? { subcategories: {} } : {})
						};
					}
				});
			}
		});

		return result;
	}

	function handleUpdate(newItems: DndItem[]) {
		try {
			structuredItems = newItems;
			const newConfig = convertToConfig(newItems);
			categories.set(newConfig);
			categoryConfig = newConfig;
			dragError = null;
		} catch (error) {
			console.error('Error handling update:', error);
			dragError = error instanceof Error ? error.message : 'Error updating items';
		}
	}

	const flipDurationMs = 300;
</script>

<div class="h-auto w-auto max-w-full overflow-y-auto p-1" role="region" aria-label="Collection Board" aria-busy={isDragging}>
	{#if dragError}
		<div class="mb-4 rounded bg-error-500/10 p-4 text-error-500" role="alert">
			{dragError}
		</div>
	{/if}

	<div
		use:dndzone={{ items: structuredItems, flipDurationMs, centreDraggedOnCursor: true }}
		onconsider={handleDndConsider}
		onfinalize={handleDndFinalize}
		class="min-h-[2em]"
		role="list"
		aria-label="Collection Categories"
	>
		{#each structuredItems as item (item.id)}
			<div animate:flip={{ duration: flipDurationMs }} class="my-1 w-full" role="listitem" aria-label={item.name}>
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
