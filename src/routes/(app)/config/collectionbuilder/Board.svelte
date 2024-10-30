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
		isCollection?: boolean;
		items?: DndItem[];
	}

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

	let structuredItems = createStructuredItems(categoryConfig);

	function handleDndConsider(e: CustomEvent<{ items: DndItem[] }>) {
		structuredItems = e.detail.items;
	}

	function handleDndFinalize(e: CustomEvent<{ items: DndItem[] }>) {
		structuredItems = e.detail.items;
		const newConfig = convertToConfig(structuredItems);
		categories.set(newConfig);
		categoryConfig = newConfig;
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
		structuredItems = newItems;
		const newConfig = convertToConfig(newItems);
		categories.set(newConfig);
		categoryConfig = newConfig;
	}

	const flipDurationMs = 300;
</script>

<div class="h-auto w-auto max-w-full overflow-y-auto p-1">
	<div
		use:dndzone={{ items: structuredItems, flipDurationMs, centreDraggedOnCursor: true }}
		on:consider={handleDndConsider}
		on:finalize={handleDndFinalize}
		class="min-h-[2em]"
	>
		{#each structuredItems as item (item.id)}
			<div animate:flip={{ duration: flipDurationMs }} class="my-1 w-full">
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
