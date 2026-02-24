<!-- 
@files src/routes/(app)/config/collectionbuilder/NestedContent/TreeViewNode.svelte
@component
**Enhanced TreeView Node with improved design and drag & drop support**

Features:	
- Modern card-like design with depth shadows
- Smooth animations and transitions
- Clear visual hierarchy between categories and collections
- Action buttons with hover states
- Drag handle with visual feedback
- Full keyboard navigation support
- Roving tabindex for accessibility
-->
<script lang="ts">
	import type { TreeViewItem } from './tree-view-board.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { goto } from '$app/navigation';
	import { screen } from '@src/stores/screen-size-store.svelte.ts';

	interface Props {
		isOpen?: boolean;
		item: TreeViewItem & { hasChildren?: boolean };
		// Keyboard reordering props
		keyboardReorderMode?: boolean;
		onDelete?: (item: TreeViewItem) => void;
		onDuplicate?: (item: TreeViewItem) => void;
		onEditCategory: (item: TreeViewItem) => void;
		onEnterReorderMode?: () => void;
		onExitReorderMode?: () => void;
		onMoveDown?: () => void;
		onMoveToParent?: () => void;
		onMoveUp?: () => void;
		// Roving tabindex for keyboard navigation
		tabindex?: number;
		toggle?: () => void;
	}

	let {
		item,
		isOpen,
		toggle,
		onEditCategory,
		onDelete,
		onDuplicate,
		keyboardReorderMode = false,
		onMoveUp,
		onMoveDown,
		onMoveToParent,
		onEnterReorderMode,
		onExitReorderMode,
		tabindex = -1
	}: Props = $props();

	// Computed properties
	const name = $derived(item.name || 'Untitled');
	const icon = $derived(item.icon || (item.nodeType === 'category' ? 'bi:folder' : 'bi:collection'));
	const isCategory = $derived(item.nodeType === 'category');

	// Enhanced styling with better visual hierarchy
	const containerClass = $derived(
		keyboardReorderMode
			? 'group w-full min-h-[48px] p-2 sm:p-3 rounded bg-gradient-to-r from-primary-500/20 to-primary-600/10 border-2 border-primary-500 ring-2 ring-primary-500/50 flex items-center gap-2 sm:gap-3 cursor-pointer transition-all duration-300 ease-out min-w-0 overflow-hidden'
			: isCategory
				? 'group w-full min-h-[48px] p-2 sm:p-3 rounded bg-gradient-to-r from-tertiary-500/10 to-tertiary-600/5 border-2 border-l-4 border-l-tertiary-500 border-tertiary-500/30 flex items-center gap-2 sm:gap-3 cursor-pointer hover:border-tertiary-500 hover:shadow-lg hover:from-tertiary-500/20 hover:to-tertiary-600/10 transition-all duration-300 ease-out min-w-0 overflow-hidden'
				: 'group w-full min-h-[48px] p-2 sm:p-3 rounded bg-gradient-to-r from-surface-100 to-surface-50 dark:from-surface-700 dark:to-surface-800 border-2 border-l-4 border-l-primary-500 border-surface-500/40 flex items-center gap-2 sm:gap-3 cursor-pointer hover:border-surface-500 hover:shadow-lg hover:translate-x-1 transition-all duration-300 ease-out min-w-0 overflow-hidden'
	);

	const iconClass = $derived(
		isCategory
			? 'text-tertiary-500 group-hover:text-tertiary-600 transition-colors duration-200'
			: 'text-error-500 group-hover:text-error-600 transition-colors duration-200'
	);

	function handleClick(e: MouseEvent) {
		if ((e.target as HTMLElement).closest('button, .drag-handle')) {
			return;
		}
		toggle?.();
	}

	function handleKeyDown(e: KeyboardEvent) {
		if (!keyboardReorderMode) {
			return;
		}

		switch (e.key) {
			case 'ArrowUp':
				e.preventDefault();
				onMoveUp?.();
				break;
			case 'ArrowDown':
				e.preventDefault();
				onMoveDown?.();
				break;
			case 'ArrowLeft':
				e.preventDefault();
				onMoveToParent?.();
				break;
			case 'Escape':
				e.preventDefault();
				onExitReorderMode?.();
				break;
			case 'Enter':
				e.preventDefault();
				onExitReorderMode?.();
				break;
		}
	}
</script>

<div
	class={containerClass}
	onclick={handleClick}
	onkeydown={handleKeyDown}
	role="button"
	{tabindex}
	aria-label={keyboardReorderMode
		? `${name}, reorder mode active. Arrow up/down to move, arrow left to move to parent, Enter or Escape to exit.`
		: `${name}, ${isCategory ? 'category' : 'collection'}. Press Enter to ${isOpen ? 'collapse' : 'expand'}.`}
>
	<!-- Expand/Collapse Toggle -->
	{#if item.hasChildren || isCategory}
		<button
			type="button"
			class="btn-icon preset-tonal-surface-500 hover:preset-filled-surface-500 transition-all duration-200 hover:scale-110"
			onclick={(e) => {
				e.stopPropagation();
				toggle?.();
			}}
			aria-label={isOpen ? `Collapse ${name}` : `Expand ${name}`}
		>
			<iconify-icon icon={isOpen ? 'bi:chevron-down' : 'bi:chevron-right'} width="20" class="transition-transform duration-200" aria-hidden="true"
			></iconify-icon>
		</button>
	{:else}
		<div class="w-5" role="none"></div>
	{/if}

	<!-- Icon -->
	<div class="relative"><iconify-icon {icon} width="24" class={iconClass} aria-hidden="true"></iconify-icon></div>

	<!-- Name & Badge -->
	<div class="flex flex-col gap-1 min-w-0 shrink">
		<div class="flex items-center gap-1 sm:gap-2 flex-wrap">
			<span class="font-bold text-sm sm:text-base leading-none truncate">{name}</span>
			{#if isCategory}
				<span
					class="badge font-semibold bg-tertiary-500 text-white text-[9px] sm:text-[10px] px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-sm uppercase shadow-sm"
				>
					Category
				</span>
			{:else}
				<span
					class="badge font-semibold bg-secondary-500 text-white text-[9px] sm:text-[10px] px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-sm uppercase shadow-sm"
				>
					Collection
				</span>
			{/if}
		</div>
	</div>

	<!-- Description -->
	{#if screen.isDesktop && item.description}
		<div class="flex-1 px-4 min-w-0 flex justify-start">
			<span class="italic text-sm opacity-70 truncate w-full max-w-[720px] text-left" title={item.description}> {item.description} </span>
		</div>
	{/if}

	<!-- Spacer to push slug and actions to the right -->
	<div class="flex-1 min-w-0"></div>

	<!-- Slug -->
	{#if item.slug}
		<span class="badge bg-surface-500 dark:bg-surface-600 text-white px-2 py-1 rounded font-mono text-xs shadow-sm mr-2" aria-label="URL slug">
			{item.slug}
		</span>
	{/if}

	<!-- Action Buttons -->
	<div class="flex gap-1 ml-auto shrink-0 transition-opacity duration-200">
		<SystemTooltip title="Edit">
			<button
				type="button"
				class="btn-icon preset-tonal-surface-500 hover:preset-filled-surface-500 rounded transition-all duration-200 hover:scale-110"
				onclick={(e) => {
					e.stopPropagation();
					if (isCategory) onEditCategory(item);
					else goto(`/config/collectionbuilder/edit/${item.id}`);
				}}
				aria-label="Edit {name}"
			>
				<iconify-icon icon="mdi:pencil" width={24} aria-hidden="true" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
			</button>
		</SystemTooltip>

		<!-- Duplicate -->
		<SystemTooltip title="Duplicate">
			<button
				type="button"
				class="btn-icon preset-tonal-surface-500 hover:preset-filled-surface-500 rounded transition-all duration-200 hover:scale-110"
				onclick={(e) => {
					e.stopPropagation();
					onDuplicate?.(item);
				}}
				aria-label="Duplicate {name}"
			>
				<iconify-icon icon="mdi:content-copy" width={24} aria-hidden="true"></iconify-icon>
			</button>
		</SystemTooltip>

		<!-- Delete -->
		<SystemTooltip title="Delete">
			<button
				type="button"
				class="btn-icon preset-tonal-surface-500 hover:preset-filled-surface-500 rounded transition-all duration-200 hover:scale-110"
				onclick={(e) => {
					e.stopPropagation();
					onDelete?.(item);
				}}
				aria-label="Delete {name}"
			>
				<iconify-icon icon="mdi:delete" width={24} aria-hidden="true" class="text-error-500"></iconify-icon>
			</button>
		</SystemTooltip>

		<!-- Drag Handle with Keyboard Support -->
		<SystemTooltip title={keyboardReorderMode ? 'Exit reorder mode (Esc)' : 'Drag to reorder'}>
			<button
				type="button"
				class="drag-handle btn-icon preset-tonal-surface-500 rounded cursor-grab active:cursor-grabbing opacity-60 hover:opacity-100 flex items-center justify-center hover:bg-surface-300 dark:hover:bg-surface-600 transition-all duration-200 hover:scale-110"
				class:preset-filled-primary-500={keyboardReorderMode}
				onclick={(e) => {
					e.stopPropagation();
					if (keyboardReorderMode) {
						onExitReorderMode?.();
					} else {
						onEnterReorderMode?.();
					}
				}}
				aria-label={keyboardReorderMode ? 'Exit reorder mode' : 'Enter keyboard reorder mode for ' + name}
			>
				<iconify-icon icon={keyboardReorderMode ? 'mdi:check' : 'mdi:drag-vertical'} width={24} aria-hidden="true"></iconify-icon>
			</button>
		</SystemTooltip>
	</div>
</div>

<style>
	div[role='button']:focus-visible,
	button:focus-visible {
		outline: 3px solid rgb(var(--color-primary-500));
		outline-offset: 2px;
		border-radius: 0.25rem;
	}
</style>
