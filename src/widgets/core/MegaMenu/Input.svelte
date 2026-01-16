<!--
@file src/widgets/core/MegaMenu/Input.svelte
@component
**MegaMenu Widget Input Component**

Provides hierarchical menu management with drag-and-drop reordering and modal editing.
Part of the Three Pillars Architecture for enterp				</div>

				{#if item.children.length > 0 && item._expanded !== false}
					<div class="ml-8 space-y-2 border-l-2 border-surface-200 pl-4">
						{#each item.children as child (child._id)}
							<MegaMenuInput bind:value={item.children} {field} {error} />
						{/each}
					</div>dy widget system.

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
	import { modalState } from '@utils/modalState.svelte';
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
	let draggedItem = $state<any | null>(null);
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

		const draggedIndex = value.findIndex((item) => item._id === draggedItem!._id);
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

	import MenuItemEditorModal from './MenuItemEditorModal.svelte';

	// Function to open edit modal
	function editItem(item: MenuItem, level: number) {
		const modalContext: MenuEditContext = {
			item,
			level,
			fields: (field as any).fields?.[level] || [],
			isNew: false,
			parent: undefined,
			onSave: (data: Record<string, any>) => {
				item._fields = data;
				value = [...(value || [])]; // Trigger reactivity
			},
			onCancel: () => {
				// Modal closed without saving
			}
		};

		modalState.trigger(MenuItemEditorModal as any, modalContext);
	}

	// Function to delete an item
	function deleteItem(itemToDelete: MenuItem) {
		if (!value) return;

		const confirmDelete = confirm('Are you sure you want to delete this menu item and all its children?');
		if (!confirmDelete) return;

		value = value.filter((item) => item._id !== itemToDelete._id);
	}

	// Function to add child item
	function addChildItem(parentItem: MenuItem) {
		const newChild: MenuItem = {
			_id: crypto.randomUUID(),
			_fields: {},
			children: []
		};

		parentItem.children = [...(parentItem.children || []), newChild];
		value = [...(value || [])]; // Trigger reactivity
	}

	// Function to toggle expanded state
	function toggleExpanded(item: MenuItem) {
		item._expanded = item._expanded === false; // Toggle true/undefined to false, and false to true
		value = [...(value || [])]; // Trigger reactivity
	}

	const lang = $derived(contentLanguage.value);
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between border-b border-surface-200 pb-3 dark:border-surface-700">
		<h3 class=" text-lg font-semibold text-surface-900 dark:text-surface-100">Menu Structure</h3>
		<button type="button" class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500" onclick={addItem}>
			<iconify-icon icon="mdi:plus" width="16"></iconify-icon>
			Add Menu Item
		</button>
	</div>

	<div
		class="mmin-h-[200px] space-y-2"
		class:flex={!value || value.length === 0}
		class:items-center={!value || value.length === 0}
		class:justify-center={!value || value.length === 0}
	>
		{#if value && value.length > 0}
			{#each value as item, index (item._id)}
				<div
					class="rounded-lg border border-surface-200 bg-surface-50/50 transition-all duration-200 dark:border-surface-700 dark:bg-surface-800/50"
					class:scale-95={draggedItem?._id === item._id}
					class:opacity-50={draggedItem?._id === item._id}
					class:!border-primary-400={dragOverIndex === index}
					class:!bg-primary-500={dragOverIndex === index}
					class:dark:!border-primary-600={dragOverIndex === index}
					class:dark:!bg-primary-900={dragOverIndex === index}
					draggable={(field as any).defaults?.enableDragDrop !== false}
					ondragstart={(e) => handleDragStart(e, item)}
					ondragover={(e) => handleDragOver(e, index)}
					ondrop={(e) => handleDrop(e, index)}
					ondragend={handleDragEnd}
					role="listitem"
				>
					<div class="flex items-center gap-3 p-3">
						<div class=" flex items-center gap-1">
							{#if (field as any).defaults?.enableDragDrop !== false}
								<div
									class="cursor-move p-1 text-surface-400 transition-colors hover:text-surface-600 dark:text-surface-500 dark:hover:text-surface-300"
									aria-label="Drag to reorder"
								>
									<iconify-icon icon="mdi:drag" width="16"></iconify-icon>
								</div>
							{/if}

							{#if item.children.length > 0 && (field as any).defaults?.enableExpandCollapse !== false}
								<button
									type="button"
									class="preset-filled-surface-500 btn"
									onclick={() => toggleExpanded(item)}
									aria-expanded={item._expanded !== false}
									aria-label={item._expanded !== false ? 'Collapse children' : 'Expand children'}
								>
									<iconify-icon
										icon="mdi:chevron-down"
										width="16"
										class="chevron transition-transform duration-200"
										class:-rotate-90={item._expanded === false}
									></iconify-icon>
								</button>
							{:else if item.children.length === 0}
								<div class="spacer w-8"></div>
							{/if}
						</div>

						<div class=" min-w-0 flex-1">
							<span class=" truncate font-medium text-surface-900 dark:text-surface-100">
								{(item._fields as any)?.title?.[lang] || (item._fields as any)?.title?.en || 'Untitled Item'}
							</span>
							{#if item.children.length > 0}
								<span class=" ml-2 text-xs text-surface-500 dark:text-surface-400">({item.children.length} children)</span>
							{/if}
						</div>

						<div class="flex items-center gap-1">
							{#if (field as any).fields && (field as any).fields.length > 1}
								<button
									type="button"
									class="preset-filled-tertiary-500 btn dark:preset-filled-primary-500"
									onclick={() => addChildItem(item)}
									aria-label="Add child item"
									title="Add child item"
								>
									<iconify-icon icon="mdi:plus" width="14"></iconify-icon>
								</button>
							{/if}

							<button type="button" class="abtn preset-filled-surface-500" onclick={() => editItem(item, 0)} aria-label="Edit item" title="Edit item">
								<iconify-icon icon="mdi:pencil" width="14"></iconify-icon>
							</button>

							<button type="button" class="preset-filled-error-500 btn" onclick={() => deleteItem(item)} aria-label="Delete item" title="Delete item">
								<iconify-icon icon="mdi:delete" width="14"></iconify-icon>
							</button>
						</div>
					</div>

					{#if item.children.length > 0 && item._expanded !== false}
						<div class="ml-8 border-l-2 border-surface-200 pl-4 dark:border-surface-700">
							<MegaMenuInput bind:value={item.children} {field} {error} />
						</div>
					{/if}
				</div>
			{/each}
		{:else}
			<div class="py-8 text-center">
				<iconify-icon icon="mdi:menu" width="48" class="empty-icon mb-4 text-surface-300 dark:text-surface-600"></iconify-icon>
				<p class="empty-message text-surface-500 dark:text-surface-400">No menu items yet. Click "Add Menu Item" to get started.</p>
			</div>
		{/if}
	</div>

	{#if error}
		<div
			class="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300"
			role="alert"
			aria-live="polite"
		>
			<iconify-icon icon="mdi:alert-circle" width="16"></iconify-icon>
			{error}
		</div>
	{/if}
</div>
