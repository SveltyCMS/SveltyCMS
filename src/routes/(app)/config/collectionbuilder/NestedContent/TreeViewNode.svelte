<!-- 
@files src/routes/(app)/config/collectionbuilder/NestedContent/TreeViewNode.svelte
@component
**This component displays a node in the TreeView (Collection or Category)**
It is purely presentational, as drag-and-drop is handled by the parent TreeView.

Features:	
- Node Name & Icon
- Action Buttons (Edit, Delete, Duplicate)
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
		onDelete?: (item: any) => void;
		onDuplicate?: (item: any) => void;
	}

	let { item, isOpen, toggle, onEditCategory, onDelete, onDuplicate }: Props = $props();

	// Computed properties
	const name = $derived(item.name || 'Untitled');
	const icon = $derived(item.icon || (item.nodeType === 'category' ? 'bi:folder' : 'bi:collection'));
	const isCategory = $derived(item.nodeType === 'category');

	// Styling classes
	const containerClass = $derived(
		isCategory
			? 'group card p-2 variant-soft-secondary flex items-center gap-2 mb-1 cursor-pointer hover:variant-filled-secondary'
			: 'group card p-2 variant-filled-surface flex items-center gap-2 mb-1 border-l-4 border-primary-500 cursor-pointer hover:variant-filled-surface-active'
	);

	function handleClick(e: MouseEvent) {
		if ((e.target as HTMLElement).closest('button')) return;
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
		<div class="w-8"></div>
	{/if}

	<iconify-icon {icon} width="20" class="text-error-500"></iconify-icon>

	<!-- Name & Info -->
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

	<!-- Description -->
	<div class="flex-1 px-4 min-w-0 flex justify-start">
		{#if item.description}
			<span class="italic text-sm opacity-60 truncate w-full max-w-[400px] text-left" title={item.description}>
				{item.description}
			</span>
		{/if}
	</div>

	<!-- Slug -->
	{#if item.slug}
		<span class="badge bg-white text-black px-1.5 py-0.5 opacity-90 mr-2">/{item.slug}</span>
	{/if}

	<!-- Actions -->
	<div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
		<!-- Edit Button -->
		<button
			type="button"
			class="btn-icon btn-icon-sm variant-soft hover:variant-filled-primary"
			onclick={(e) => {
				e.stopPropagation();
				if (isCategory) {
					onEditCategory(item);
				} else {
					goto(`/config/collectionbuilder/edit/${item.id}`);
				}
			}}
			title="Edit"
		>
			<iconify-icon icon="mdi:pencil-outline" width="18"></iconify-icon>
		</button>

		<!-- Duplicate Button -->
		<button
			type="button"
			class="btn-icon btn-icon-sm variant-soft hover:variant-filled-tertiary"
			onclick={(e) => {
				e.stopPropagation();
				onDuplicate?.(item);
			}}
			title="Duplicate"
		>
			<iconify-icon icon="mdi:content-copy" width="18"></iconify-icon>
		</button>

		<!-- Delete Button -->
		<button
			type="button"
			class="btn-icon btn-icon-sm variant-soft hover:variant-filled-error"
			onclick={(e) => {
				e.stopPropagation();
				onDelete?.(item);
			}}
			title="Delete"
		>
			<iconify-icon icon="lucide:trash-2" width="18"></iconify-icon>
		</button>

		<!-- Drag Handle -->
		<div class="cursor-grab opacity-30 hover:opacity-100 flex items-center justify-center ml-1" aria-hidden="true">
			<iconify-icon icon="mdi-drag" width="20"></iconify-icon>
		</div>
	</div>
</div>
