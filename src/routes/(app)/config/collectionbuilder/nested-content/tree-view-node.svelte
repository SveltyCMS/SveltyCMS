<!--
@file src/routes/(app)/config/collectionbuilder/nested-content/tree-view-node.svelte
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
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { screen } from '@src/stores/screen-size-store.svelte.ts';
	import { collectionMetadata, getTagColor } from '@src/stores/collection-metadata-store.svelte';
	import type { TreeViewItem } from './tree-view-board.svelte';
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';
	import {
		builder_badge_category,
		builder_badge_collection,
		builder_count_items_plural,
		builder_count_items_singular,
		builder_drag_hint,
		builder_duplicate,
		builder_fav_add_aria,
		builder_fav_add_tip,
		builder_fav_remove_aria,
		builder_fav_remove_tip,
		builder_manage_tags_aria,
		builder_node_collapse,
		builder_node_expand,
		button_delete,
		button_edit,
		collections_manage_tags
	} from '@src/paraglide/messages';

	interface Props {
		isOpen?: boolean;
		item: TreeViewItem & { hasChildren?: boolean; children?: TreeViewItem[] };
		/** When true, this category is the one selected for "add collection" (visual highlight). */
		isSelectedCategory?: boolean;
		onDelete?: (item: TreeViewItem) => void;
		onDuplicate?: (item: TreeViewItem) => void;
		onEditCategory: (item: TreeViewItem) => void;
		onEditTags?: (item: TreeViewItem) => void;
		/** Called when category row is clicked (toggle selection for add-collection target). */
		onSelectCategory?: () => void;
		// Roving tabindex for keyboard navigation
		tabindex?: number;
		toggle?: () => void;
	}

	let {
		item,
		isOpen,
		isSelectedCategory = false,
		toggle,
		onEditCategory,
		onEditTags,
		onDelete,
		onDuplicate,
		onSelectCategory,
		tabindex = -1
	}: Props = $props();

	const isFav = $derived(collectionMetadata.isFavorite(item.id));
	const tags = $derived(collectionMetadata.getTags(item.id));

	// Computed properties
	const name = $derived(item.name || 'Untitled');
	const icon = $derived(
		item.icon || (item.nodeType === 'category' ? 'bi:folder' : 'bi:collection')
	);
	const isCategory = $derived(item.nodeType === 'category');
	const childCount = $derived(Array.isArray(item.children) ? item.children.length : 0);

	// Visual hierarchy only. No transitions or transforms: the row must stay
	// geometrically still so drag targeting is predictable.
	const base =
		'group w-full min-h-[48px] rounded flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0 overflow-hidden border-2';

	const containerClass = $derived(
		isCategory && isSelectedCategory
			? `${base} bg-tertiary-500/20 border-tertiary-500 dark:bg-primary-600/25 dark:border-primary-500`
			: isCategory
				? `${base} bg-tertiary-500/10 border-tertiary-500/30 hover:border-tertiary-500`
				: `${base} bg-surface-500/10 dark:bg-surface-700 border-surface-500/40 hover:border-surface-500`
	);

	const iconClass = $derived(isCategory ? 'text-tertiary-500' : 'text-error-500');

	function activate() {
		// Category row click = toggle selection (highlight); expand/collapse via chevron only
		if (isCategory && onSelectCategory) {
			onSelectCategory();
			return;
		}
		toggle?.();
	}

	function handleClick(e: MouseEvent) {
		if ((e.target as HTMLElement).closest('button, a[href], .drag-handle')) {
			return;
		}
		activate();
	}

	// Enter/Space activate the row the same way a click does. Navigation and
	// reordering keys are owned by the tree container, so they must bubble.
	function handleKeyDown(e: KeyboardEvent) {
		if (e.key !== 'Enter' && e.key !== ' ') return;
		if ((e.target as HTMLElement).closest('button, a[href]')) return;
		e.preventDefault();
		activate();
	}
</script>

<div
	class={containerClass}
	onclick={handleClick}
	onkeydown={handleKeyDown}
	role="button"
	{tabindex}
	aria-label={isCategory
		? `${name}, category. Press Enter to ${isSelectedCategory ? 'deselect' : 'select'} as target for new collection. Alt plus arrow keys to move.`
		: `${name}, collection. Alt plus arrow keys to move.`}
>
	<!-- Expand/Collapse Toggle -->
	{#if item.hasChildren || isCategory}
		<Button
			variant="transparent"
			type="button"
			onclick={(e: MouseEvent) => {
				e.stopPropagation();
				toggle?.();
			}}
			aria-label={isOpen ? builder_node_collapse({ name }) : builder_node_expand({ name })}
			class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity hover:opacity-80"
		>
			<iconify-icon
				icon={isOpen ? 'bi:chevron-down' : 'bi:chevron-right'}
				width="20"
				aria-hidden="true"
			></iconify-icon>
		</Button>
	{:else}
		<div class="w-5" role="none"></div>
	{/if}

	<!-- Icon -->
	<div class="relative flex items-center">
		<iconify-icon {icon} width="24" class={iconClass} aria-hidden="true"></iconify-icon>
	</div>

	<!-- Name & Badge: flexible width for responsiveness -->
	<div class="flex flex-1 flex-col gap-1 min-w-0">
		<div class="flex items-center gap-1 sm:gap-2 flex-wrap">
			<span
				class="font-bold text-xs sm:text-base leading-none truncate max-w-37.5 sm:max-w-95"
				title={name}>{name}</span
			>
			{#if isCategory}
				<Badge variant="tertiary" size="sm" rounded={false}>{builder_badge_category()}</Badge>
				<span class="text-xs text-surface-500 dark:text-surface-400 font-medium">
					{childCount === 1
						? builder_count_items_singular({ count: childCount })
						: builder_count_items_plural({ count: childCount })}
				</span>
			{:else}
				<Badge variant="error" size="sm" rounded={false}>{builder_badge_collection()}</Badge>
			{/if}

			{#if tags.length > 0}
				<div class="flex items-center gap-1 flex-wrap">
					{#each tags as tag (tag)}
						{@const color = getTagColor(tag)}
						<span
							class="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold rounded-full {color.bg} {color.text} border {color.border}"
						>
							{tag}
						</span>
					{/each}
				</div>
			{/if}

			<!-- Slug - Hidden on mobile to save space -->
			{#if item.slug}
				<Badge
					variant="surface"
					size="sm"
					rounded={false}
					class="hidden sm:inline-flex font-mono ms-auto opacity-80 shadow-sm"
					aria-label="URL slug"
				>
					{item.slug}
				</Badge>
			{/if}
		</div>
	</div>

	<!-- Description: hidden on small screens -->
	{#if screen.isDesktop && item.description}
		<div class="flex-1 px-4 min-w-0 hidden md:flex justify-start">
			<span
				class="italic text-sm opacity-70 truncate w-full max-w-160 md:max-w-300 text-start"
				title={item.description}
			>
				{item.description}
			</span>
		</div>
	{/if}

	<!-- Action Buttons -->
	<div
		class="ms-auto flex shrink-0 items-center gap-0.5 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity"
	>
		<!-- Favorite Toggle (logical ms-auto group keeps it on the inner edge in LTR + RTL) -->
		<SystemTooltip title={isFav ? builder_fav_remove_tip() : builder_fav_add_tip()}>
			<Button
				variant="transparent"
				type="button"
				onclick={(e: MouseEvent) => {
					e.stopPropagation();
					collectionMetadata.toggleFavorite(item.id);
				}}
				aria-label={isFav ? builder_fav_remove_aria({ name }) : builder_fav_add_aria({ name })}
				class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-transform hover:scale-110"
			>
				<iconify-icon
					icon={isFav ? 'bi:star-fill' : 'bi:star'}
					width="18"
					class={isFav
						? 'text-warning-500'
						: 'text-surface-400 dark:text-surface-500 opacity-40 hover:opacity-100'}
				></iconify-icon>
			</Button>
		</SystemTooltip>

		<!-- Tags -->
		<SystemTooltip title={collections_manage_tags()}>
			<Button
				variant="transparent"
				type="button"
				onclick={(e: MouseEvent) => {
					e.stopPropagation();
					onEditTags?.(item);
				}}
				aria-label={builder_manage_tags_aria({ name })}
				class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity hover:opacity-80"
			>
				<iconify-icon
					icon="bi:tag"
					width={20}
					class="text-surface-500 hover:text-tertiary-500 dark:text-primary-500"
				></iconify-icon>
			</Button>
		</SystemTooltip>

		<SystemTooltip title={button_edit()}>
			{#if isCategory}
				<Button
					variant="transparent"
					type="button"
					onclick={(e: MouseEvent) => {
						e.stopPropagation();
						onEditCategory(item);
					}}
					aria-label={`${button_edit()} ${name}`}
					class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity hover:opacity-80"
				>
					<iconify-icon
						icon="mdi:pencil"
						width={22}
						aria-hidden="true"
						class="text-tertiary-500 dark:text-primary-500"
					></iconify-icon>
				</Button>
			{:else}
				<Button
					variant="transparent"
					size="sm"
					href={`/config/collectionbuilder/edit/${item.id}`}
					data-sveltekit-preload-data="hover"
					class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity hover:opacity-80"
					onclick={(e: MouseEvent) => e.stopPropagation()}
					aria-label={`${button_edit()} ${name}`}
				>
					<iconify-icon
						icon="mdi:pencil"
						width={22}
						aria-hidden="true"
						class="text-tertiary-500 dark:text-primary-500"
					></iconify-icon>
				</Button>
			{/if}
		</SystemTooltip>

		<!-- Duplicate -->
		<SystemTooltip title={builder_duplicate()}>
			<Button
				variant="transparent"
				type="button"
				onclick={(e: MouseEvent) => {
					e.stopPropagation();
					onDuplicate?.(item);
				}}
				aria-label={`${builder_duplicate()} ${name}`}
				class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity hover:opacity-80"
			>
				<iconify-icon icon="mdi:content-copy" width={22} aria-hidden="true"></iconify-icon>
			</Button>
		</SystemTooltip>

		<!-- Delete -->
		<SystemTooltip title={button_delete()}>
			<Button
				variant="transparent"
				type="button"
				onclick={(e: MouseEvent) => {
					e.stopPropagation();
					onDelete?.(item);
				}}
				aria-label={`${button_delete()} ${name}`}
				class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity hover:opacity-80"
			>
				<iconify-icon icon="mdi:delete" width={22} aria-hidden="true" class="text-error-500"
				></iconify-icon>
			</Button>
		</SystemTooltip>

		<!-- Drag affordance. Deliberately NOT a button: it has no click behaviour,
		     so a click here can never toggle a mode or move the row. Dragging is
		     handled by the draggable action on the row wrapper. Keyboard users
		     reorder with Alt+Arrow keys on the tree. -->
		<SystemTooltip title={builder_drag_hint()}>
			<span
				class="drag-handle flex min-h-8 min-w-8 cursor-grab items-center justify-center opacity-60 active:cursor-grabbing"
				aria-hidden="true"
			>
				<iconify-icon icon="mdi:drag-vertical" width={22}></iconify-icon>
			</span>
		</SystemTooltip>
	</div>
</div>

<style>
	div[role='button']:focus-visible {
		outline: 3px solid var(--color-tertiary-500);
		outline-offset: 2px;
		border-radius: 0.25rem;
	}
	:global(.dark) div[role='button']:focus-visible {
		outline-color: var(--color-primary-500);
	}
</style>
