<!-- 
@files src/routes/(app)/config/collectionbuilder/NestedContent/TreeViewNode.svelte
@component
**This component displays a node in the TreeView (Collection or Category)**
It is purely presentational, as drag-and-drop is handled by the parent TreeView.

Features:	
- Node Name & Icon
- Action Buttons (Edit, etc.)
- Visual styling based on node type
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import type { TreeViewItem } from '@utils/treeViewAdapter';

	interface Props {
		item: TreeViewItem & { hasChildren?: boolean }; // The current item provided by TreeView

		// TreeView props passed via snippet
		isOpen?: boolean;
		toggle?: () => void;

		onEditCategory: (item: any) => void;
	}

	let { item, isOpen, toggle, onEditCategory }: Props = $props();

	// Computed properties
	const name = $derived(item.name || 'Untitled');
	const icon = $derived(item.icon || (item.nodeType === 'category' ? 'bi:folder' : 'bi:collection'));
	const isCategory = $derived(item.nodeType === 'category');

	// Styling classes
	// Categories get a different look than Collections
	const containerClass = $derived(
		isCategory
			? 'group card p-2 variant-soft-secondary flex items-center gap-2 mb-1 cursor-pointer hover:variant-filled-secondary'
			: 'group card p-2 variant-filled-surface flex items-center gap-2 mb-1 border-l-4 border-primary-500 cursor-pointer hover:variant-filled-surface-active'
	);

	function handleClick(e: MouseEvent) {
		// Prevent navigation if clicking on interactive elements
		if ((e.target as HTMLElement).closest('button')) return;

		// Default behavior: toggle if expandable (for both categories and collections if they have children)
		// Edit is now handled exclusively by the button
		toggle?.();
	}
</script>

<div
	class={containerClass}
	onclick={handleClick}
	onkeydown={(e) => e.key === 'Enter' && handleClick(e as unknown as MouseEvent)}
	role="button"
	tabindex="0"
>
	<!-- Expand/Collapse Toggle -->
	{#if item.hasChildren || isCategory}
		<button
			type="button"
			class="btn-icon btn-icon-sm variant-soft hover:variant-filled"
			onclick={(e) => {
				e.stopPropagation();
				toggle?.();
			}}
			aria-label={isOpen ? 'Collapse' : 'Expand'}
		>
			<iconify-icon icon={isOpen ? 'bi:chevron-down' : 'bi:chevron-right'}></iconify-icon>
		</button>
	{:else}
		<!-- Spacer for alignment -->
		<div class="w-8"></div>
	{/if}

	<!-- User requested category icons to be primary as well -->
	<iconify-icon {icon} width="20" class="text-error-500"></iconify-icon>

	<!-- Name & Info (Left) -->
	<div class="flex flex-col gap-0.5 min-w-[200px]">
		<div class="flex items-center gap-2">
			<span class="font-bold">{name}</span>
			{#if isCategory}
				<span class="badge variant-soft-secondary text-[10px] uppercase opacity-60">Category</span>
			{:else}
				<span class="badge variant-soft-tertiary text-[10px] uppercase opacity-60">Collection</span>
			{/if}
		</div>
	</div>

	<!-- Description (Center) -->
	<div class="flex-1 px-4 min-w-0 flex justify-start">
		{#if item.description}
			<span class="italic text-sm opacity-60 truncate w-full max-w-[400px] text-left" title={item.description}>
				{item.description}
			</span>
		{/if}
	</div>

	<!-- Slug (Right) -->
	{#if item.slug}
		<span class="badge bg-white text-black px-1.5 py-0.5 opacity-90 mr-2">/{item.slug}</span>
	{/if}

	<!-- Actions -->
	<div class="flex gap-1">
		<button
			type="button"
			class="btn-icon btn-icon-sm"
			onclick={(e) => {
				e.stopPropagation();
				if (isCategory) {
					onEditCategory(item);
				} else {
					// Use 'edit' action and the collection ID (UUID)
					// The route expects /config/collectionbuilder/[action]/[...contentPath]
					// So: /config/collectionbuilder/edit/[UUID]
					goto(`/config/collectionbuilder/edit/${item.id}`);
				}
			}}
			title="Edit"
		>
			<iconify-icon icon="mdi:pencil-outline" width="20"></iconify-icon>
		</button>

		<button
			type="button"
			class="btn-icon btn-icon-sm"
			onclick={(e) => {
				e.stopPropagation();
				// TODO: Implement delete callback
				console.log('Delete clicked', item);
				alert('Delete not implemented yet');
			}}
			title="Delete"
		>
			<iconify-icon icon="lucide:trash-2" width="20" class="text-error-500"></iconify-icon>
		</button>
		<!-- Icon -->
		<!-- Drag Handle (Visual Only) -->
		<div class="cursor-grab opacity-30 hover:opacity-100 flex items-center justify-center mr-1" aria-hidden="true">
			<iconify-icon icon="mdi-drag" width="20"></iconify-icon>
		</div>
	</div>
</div>
