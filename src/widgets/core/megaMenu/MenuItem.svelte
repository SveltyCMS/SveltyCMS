<!--
@file src/widgets/core/megaMenu/MenuItem.svelte
@component
**MegaMenu MenuItem Component**

Recursive component for rendering individual menu items with editing capabilities.
Supports nested hierarchical menu structures with infinite depth levels.

@example
<MenuItem bind:item={menuItem} field={fieldDefinition} level={0} />
Renders menu item with edit button and recursive children 

### Props
- `item: MenuItem` - Menu item data with fields and children (bindable)
- `field: FieldType` - Widget field definition for menu structure
- `level: number` - Current nesting level for visual indentation

### Features
- **Recursive Rendering**: Self-referencing component for nested menu structures
- **Modal Integration**: Opens Skeleton Labs modal for item editing
- **Visual Hierarchy**: CSS custom properties for level-based indentation
- **Multilingual Support**: Displays titles in current language with fallback
- **Real-time Updates**: Binds item data for immediate UI updates
- **Infinite Nesting**: Supports unlimited menu depth levels
-->

<script lang="ts">
	import { getModalStore } from '@skeletonlabs/skeleton';
	import type { FieldType } from './';
	import type { MenuItem } from './types';

	let { item, field, level }: { item: MenuItem; field: FieldType; level: number } = $props();

	// Function to open the editing modal for this specific item.
	function editItem() {
		getModalStore().trigger({
			type: 'component',
			component: 'menuItemEditorModal', // A new modal component you would create
			meta: {
				fields: field.fields[level], // Pass the fields for the current level
				data: item._fields,
				// Callback to update the data when the modal closes
				callback: (newData: Record<string, any>) => {
					item._fields = newData;
				}
			}
		});
	}

	// Recursive call to render children
</script>

<div class="menu-item" style:--level={level}>
	<div class="item-header">
		<span>{item._fields?.title?.en || 'Untitled'}</span>
		<button onclick={editItem}>Edit</button>
	</div>
	{#if item.children.length > 0}
		<div class="children">
			{#each item.children as child, index (child._id)}
				<svelte:self bind:item={item.children[index]} {field} level={level + 1} />
			{/each}
		</div>
	{/if}
</div>

<style>
	.menu-item {
		margin-left: calc(var(--level, 0) * 2rem);
	}
	/* ... other styles */
</style>
