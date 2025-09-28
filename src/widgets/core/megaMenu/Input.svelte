<!--
@file src/widgets/core/megaMenu/Input.svelte
@component
**MegaMenu Widget Input Component**

Provides hierarchical menu management with drag-and-drop reordering and modal editing.
Part of the Three Pillars Architecture for enterprise-ready widget system.

@example
<MegaMenuInput bind:value={menuItems} field={fieldDefinition} />
Interactive menu builder with add/edit/reorder capabilities

### Props
- `field: FieldType` - Widget field definition with menu structure configuration
- `value: MenuItem[] | null | undefined` - Array of menu items (bindable)
- `error?: string | null` - Validation error message for display

### Features
- **Hierarchical Menu Builder**: Create nested menu structures with unlimited depth
- **Drag & Drop Reordering**: Visual reordering of menu items with advanced positioning
- **Modal Editing**: Skeleton Labs modal integration for item editing
- **UUID Generation**: Automatic unique ID assignment for new menu items
- **Empty State Handling**: User-friendly message when no items exist
- **Real-time Updates**: Immediate UI updates with proper reactivity
- **Error Display**: Accessible error messaging with ARIA attributes
- **Expand/Collapse**: Visual hierarchy with collapsible sections
- **Visual Indicators**: Icons and styling for different operations
-->

<script lang="ts">
	import { getModalStore } from '@skeletonlabs/skeleton';
	import type { FieldType } from './';
	import type { MenuItem, MenuEditContext } from './types';
	import { contentLanguage } from '@src/stores/store.svelte';
	import MegaMenuInput from './Input.svelte';

	let { field, value = $bindable(), error }: { field: FieldType; value: MenuItem[] | null | undefined; error?: string | null } = $props();

	// Initialize the value as an empty array if it's null or undefined.
	if (!value) {
		value = [];
	}

	// State for drag and drop
	let draggedItem = $state<MenuItem | null>(null);
	let dragOverIndex = $state<number | null>(null);

	// Function to add a new top-level menu item.
	function addItem() {
		value = [
			...(value || []),
			{
				_id: crypto.randomUUID(),
				_fields: {},
				children: []
			}
		];
	}

	// Function to handle drag start
	function handleDragStart(event: DragEvent, item: MenuItem) {
		draggedItem = item;
		event.dataTransfer!.effectAllowed = 'move';
		event.dataTransfer!.setData('text/plain', item._id);
	}

	// Function to handle drag over
	function handleDragOver(event: DragEvent, index: number) {
		event.preventDefault();
		dragOverIndex = index;
	}

	// Function to handle drop
	function handleDrop(event: DragEvent, dropIndex: number) {
		event.preventDefault();

		if (!draggedItem || !value) return;

		const draggedIndex = value.findIndex(item => item._id === draggedItem!._id);
		if (draggedIndex === -1) return;

		// Remove dragged item from current position
		const newValue = [...value];
		const [removed] = newValue.splice(draggedIndex, 1);

		// Insert at new position
		let insertIndex = dropIndex;
		if (draggedIndex < dropIndex) {
			insertIndex--; // Adjust for removed item
		}

		newValue.splice(insertIndex, 0, removed);
		value = newValue;

		// Reset drag state
		draggedItem = null;
		dragOverIndex = null;
	}

	// Function to handle drag end
	function handleDragEnd() {
		draggedItem = null;
		dragOverIndex = null;
	}

	// Function to open edit modal
	function editItem(item: MenuItem, level: number) {
		const modalContext: MenuEditContext = {
			item,
			level,
			fields: (field as any).fields?.[level] || [],
			isNew: false,
			parent: undefined,
			onSave: (data: Record<string, unknown>) => {
				item._fields = data;
				value = [...(value || [])]; // Trigger reactivity
			},
			onCancel: () => {
				// Modal closed without saving
			}
		};

		getModalStore().trigger({
			type: 'component',
			component: 'menuItemEditorModal',
			meta: modalContext
		});
	}

	// Function to delete an item
	function deleteItem(itemToDelete: MenuItem) {
		if (!value) return;

		const confirmDelete = confirm('Are you sure you want to delete this menu item and all its children?');
		if (!confirmDelete) return;

		value = value.filter(item => item._id !== itemToDelete._id);
	}

	// Function to add child item
	function addChildItem(parentItem: MenuItem) {
		const newChild: MenuItem = {
			_id: crypto.randomUUID(),
			_fields: {},
			children: []
		};

		parentItem.children.push(newChild);
		value = [...(value || [])]; // Trigger reactivity
	}

	// Function to toggle expanded state
	function toggleExpanded(item: MenuItem) {
		item._expanded = !item._expanded;
		value = [...(value || [])]; // Trigger reactivity
	}
</script>

<div class="megamenu-container" class:invalid={error}>
	<div class="menu-header">
		<h3 class="menu-title">Menu Structure</h3>
		<button type="button" class="add-root-btn" onclick={addItem}>
			<iconify-icon icon="mdi:plus" width="16"></iconify-icon>
			Add Menu Item
		</button>
	</div>

	<div class="menu-list" class:empty={!value || value.length === 0}>
		{#if value && value.length > 0}
			{#each value as item, index (item._id)}
				<div
					class="menu-item"
					class:dragged={draggedItem?._id === item._id}
					class:drag-over={dragOverIndex === index}
					draggable={(field as any).defaults?.enableDragDrop !== false}
					ondragstart={(e) => handleDragStart(e, item)}
					ondragover={(e) => handleDragOver(e, index)}
					ondrop={(e) => handleDrop(e, index)}
					ondragend={handleDragEnd}
					role="listitem"
				>
					<div class="item-header">
						<div class="item-controls">
							{#if (field as any).defaults?.enableDragDrop !== false}
								<div class="drag-handle" aria-label="Drag to reorder">
									<iconify-icon icon="mdi:drag" width="16"></iconify-icon>
								</div>
							{/if}

							{#if item.children.length > 0 && (field as any).defaults?.enableExpandCollapse !== false}
								<button
									type="button"
									class="expand-btn"
									onclick={() => toggleExpanded(item)}
									aria-expanded={item._expanded !== false}
									aria-label={item._expanded !== false ? 'Collapse children' : 'Expand children'}
								>
									<iconify-icon
										icon="mdi:chevron-down"
										width="16"
										class="chevron"
										class:rotated={item._expanded === false}
									></iconify-icon>
								</button>
							{:else if item.children.length === 0}
								<div class="spacer"></div>
							{/if}
						</div>

						<div class="item-content">
							<span class="item-title">
								{(item._fields as any)?.title?.[$contentLanguage] || (item._fields as any)?.title?.en || 'Untitled Item'}
							</span>
							{#if item.children.length > 0}
								<span class="children-count">({item.children.length} children)</span>
							{/if}
						</div>

						<div class="item-actions">
							{#if (field as any).fields && (field as any).fields.length > 1}
								<button
									type="button"
									class="action-btn add-child-btn"
									onclick={() => addChildItem(item)}
									aria-label="Add child item"
									title="Add child item"
								>
									<iconify-icon icon="mdi:plus" width="14"></iconify-icon>
								</button>
							{/if}

							<button
								type="button"
								class="action-btn edit-btn"
								onclick={() => editItem(item, 0)}
								aria-label="Edit item"
								title="Edit item"
							>
								<iconify-icon icon="mdi:pencil" width="14"></iconify-icon>
							</button>

							<button
								type="button"
								class="action-btn delete-btn"
								onclick={() => deleteItem(item)}
								aria-label="Delete item"
								title="Delete item"
							>
								<iconify-icon icon="mdi:delete" width="14"></iconify-icon>
							</button>
						</div>
					</div>

					{#if item.children.length > 0 && item._expanded !== false}
						<div class="children-container">
							{#each item.children as child (child._id)}
								<MegaMenuInput
									bind:value={item.children}
									{field}
									{error}
								/>
							{/each}
						</div>
					{/if}
				</div>
			{/each}
		{:else}
			<div class="empty-state">
				<iconify-icon icon="mdi:menu" width="48" class="empty-icon"></iconify-icon>
				<p class="empty-message">No menu items yet. Click "Add Menu Item" to get started.</p>
			</div>
		{/if}
	</div>

	{#if error}
		<div class="error-message" role="alert" aria-live="polite">
			<iconify-icon icon="mdi:alert-circle" width="16"></iconify-icon>
			{error}
		</div>
	{/if}
</div>

<style lang="postcss">
	.megamenu-container {
		@apply space-y-4;
	}

	.menu-header {
		@apply flex items-center justify-between pb-3 border-b border-surface-200;
	}

	.menu-title {
		@apply text-lg font-semibold text-surface-900;
	}

	.add-root-btn {
		@apply flex items-center gap-2 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors;
	}

	.menu-list {
		@apply space-y-2 min-h-[200px];
	}

	.menu-list.empty {
		@apply flex items-center justify-center;
	}

	.menu-item {
		@apply border border-surface-200 rounded-lg bg-surface-50/50 transition-all duration-200;
	}

	.menu-item.dragged {
		@apply opacity-50 scale-95;
	}

	.menu-item.drag-over {
		@apply border-primary-400 bg-primary-50/30;
	}

	.item-header {
		@apply flex items-center gap-3 p-3;
	}

	.item-controls {
		@apply flex items-center gap-1;
	}

	.drag-handle {
		@apply cursor-move p-1 text-surface-400 hover:text-surface-600 transition-colors;
	}

	.expand-btn {
		@apply p-1 text-surface-500 hover:text-surface-700 transition-colors rounded;
	}

	.chevron {
		@apply transition-transform duration-200;
	}

	.chevron.rotated {
		@apply -rotate-90;
	}

	.spacer {
		@apply w-8;
	}

	.item-content {
		@apply flex-1 min-w-0;
	}

	.item-title {
		@apply font-medium text-surface-900 truncate;
	}

	.children-count {
		@apply ml-2 text-xs text-surface-500;
	}

	.item-actions {
		@apply flex items-center gap-1;
	}

	.action-btn {
		@apply p-2 text-surface-500 hover:text-surface-700 transition-colors rounded;
	}

	.edit-btn:hover {
		@apply text-blue-600;
	}

	.delete-btn:hover {
		@apply text-red-600;
	}

	.add-child-btn:hover {
		@apply text-green-600;
	}

	.children-container {
		@apply ml-8 pl-4 border-l-2 border-surface-200 space-y-2;
	}

	.empty-state {
		@apply text-center py-8;
	}

	.empty-icon {
		@apply text-surface-300 mb-4;
	}

	.empty-message {
		@apply text-surface-500;
	}

	.error-message {
		@apply flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700;
	}

	/* Dark mode adjustments */
	@media (prefers-color-scheme: dark) {
		.menu-item {
			@apply bg-surface-800/50 border-surface-700;
		}

		.menu-item.drag-over {
			@apply border-primary-600 bg-primary-900/20;
		}

		.drag-handle {
			@apply text-surface-500 hover:text-surface-300;
		}

		.expand-btn {
			@apply text-surface-400 hover:text-surface-200;
		}

		.item-title {
			@apply text-surface-100;
		}

		.children-count {
			@apply text-surface-400;
		}

		.action-btn {
			@apply text-surface-400 hover:text-surface-200;
		}

		.children-container {
			@apply border-surface-700;
		}

		.empty-icon {
			@apply text-surface-600;
		}

		.empty-message {
			@apply text-surface-400;
		}
	}
</style>
