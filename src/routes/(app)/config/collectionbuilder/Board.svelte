<!-- 
@files src/routes/(app)/config/collection/Board.svelte
@description Board component for managing nested collections. 
-->
<script lang="ts">
	// Component
	import Column from './Column.svelte';
	// Svelte DND-actions
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';

	export let categoryConfig: Record<string, any>;
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
	function createStructuredItems(config: Record<string, any>): DndItem[] {
		return Object.entries(config).map(([key, category]) => {
			const items: DndItem[] = [];

			if (category.subcategories) {
				Object.entries(category.subcategories).forEach(([subKey, subCategory]: [string, any]) => {
					// Check if this subcategory has its own subcategories
					if (subCategory.subcategories && Object.keys(subCategory.subcategories).length > 0) {
						// It's a category with nested items
						items.push({
							id: subCategory.id || subKey,
							name: subCategory.name,
							icon: subCategory.icon,
							isCategory: true,
							parentId: key,
							items: Object.entries(subCategory.subcategories).map(([collKey, coll]: [string, any]) => ({
								id: coll.id || collKey,
								name: coll.name,
								icon: coll.icon,
								isCategory: false,
								parentId: subKey
							}))
						});
					} else {
						// It's a direct collection
						items.push({
							id: subCategory.id || subKey,
							name: subCategory.name,
							icon: subCategory.icon,
							isCategory: false,
							parentId: key
						});
					}
				});
			}

			return {
				id: category.id || key,
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

	function handleDndFinalize(e: CustomEvent<{ items: DndItem[] }>) {
		const newItems = e.detail.items;

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
		handleUpdate(newItems);
	}

	function handleUpdate(newItems: DndItem[]) {
		// Convert the dnd format back to categoryConfig format
		const newConfig = newItems.reduce((acc: Record<string, any>, item) => {
			acc[item.id] = {
				id: item.id,
				name: item.name,
				icon: item.icon
			};

			if (item.items && item.items.length > 0) {
				acc[item.id].subcategories = item.items.reduce((subAcc: Record<string, any>, subItem) => {
					if (subItem.isCategory && subItem.items) {
						// Handle nested categories
						subAcc[subItem.id] = {
							id: subItem.id,
							name: subItem.name,
							icon: subItem.icon,
							subcategories: subItem.items.reduce((nestedAcc: Record<string, any>, nestedItem) => {
								nestedAcc[nestedItem.id] = {
									id: nestedItem.id,
									name: nestedItem.name,
									icon: nestedItem.icon
								};
								return nestedAcc;
							}, {})
						};
					} else {
						// Handle direct collections
						subAcc[subItem.id] = {
							id: subItem.id,
							name: subItem.name,
							icon: subItem.icon
						};
					}
					return subAcc;
				}, {});
			}

			return acc;
		}, {});

		// Update the parent component
		categoryConfig = newConfig;
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
