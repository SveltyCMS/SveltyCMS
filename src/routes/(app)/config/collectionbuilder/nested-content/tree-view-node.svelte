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
import SystemTooltip from "@src/components/system/system-tooltip.svelte";
import { screen } from "@src/stores/screen-size-store.svelte.ts";
import type { TreeViewItem } from "./tree-view-board.svelte";
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';

interface Props {
	isOpen?: boolean;
	item: TreeViewItem & { hasChildren?: boolean };
	/** When true, this category is the one selected for "add collection" (visual highlight). */
	isSelectedCategory?: boolean;
	onDelete?: (item: TreeViewItem) => void;
	onDuplicate?: (item: TreeViewItem) => void;
	onEditCategory: (item: TreeViewItem) => void;
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
	onDelete,
	onDuplicate,
	onSelectCategory,
	tabindex = -1,
}: Props = $props();

// Computed properties
const name = $derived(item.name || "Untitled");
const icon = $derived(
	item.icon || (item.nodeType === "category" ? "bi:folder" : "bi:collection"),
);
const isCategory = $derived(item.nodeType === "category");

// Visual hierarchy only. No transitions or transforms: the row must stay
// geometrically still so drag targeting is predictable.
const base =
	"group w-full min-h-[48px] p-2 sm:p-3 rounded flex items-center gap-2 sm:gap-3 cursor-pointer min-w-0 overflow-hidden border-2";

const containerClass = $derived(
	isCategory && isSelectedCategory
		? `${base} bg-primary-500/20 dark:bg-primary-600/25 border-primary-500`
		: isCategory
			? `${base} bg-tertiary-500/10 border-s-4 border-s-tertiary-500 border-tertiary-500/30 hover:border-tertiary-500`
			: `${base} bg-surface-500/10 dark:bg-surface-700 border-s-4 border-s-primary-500 border-surface-500/40 hover:border-surface-500`,
);

const iconClass = $derived(isCategory ? "text-tertiary-500" : "text-error-500");

function activate() {
	// Category row click = toggle selection (highlight); expand/collapse via chevron only
	if (isCategory && onSelectCategory) {
		onSelectCategory();
		return;
	}
	toggle?.();
}

function handleClick(e: MouseEvent) {
	if ((e.target as HTMLElement).closest("button, a[href], .drag-handle")) {
		return;
	}
	activate();
}

// Enter/Space activate the row the same way a click does. Navigation and
// reordering keys are owned by the tree container, so they must bubble.
function handleKeyDown(e: KeyboardEvent) {
	if (e.key !== "Enter" && e.key !== " ") return;
	if ((e.target as HTMLElement).closest("button, a[href]")) return;
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
		<Button variant="ghost"
			type="button"
			onclick={(e: MouseEvent) => {
				e.stopPropagation();
				toggle?.();
			}}
			aria-label={isOpen ? `Collapse ${name}` : `Expand ${name}`}
		 class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity hover:opacity-80">
			<iconify-icon icon={isOpen ? 'bi:chevron-down' : 'bi:chevron-right'} width="20" aria-hidden="true"
			></iconify-icon>
		</Button>
	{:else}
		<div class="w-5" role="none"></div>
	{/if}

	<!-- Icon -->
	<div class="relative"><iconify-icon {icon} width="24" class={iconClass} aria-hidden="true"></iconify-icon></div>

	<!-- Name & Badge: flexible width for responsiveness -->
	<div class="flex flex-1 flex-col gap-1 min-w-0">
		<div class="flex items-center gap-1 sm:gap-2 flex-wrap">
			<span class="font-bold text-sm sm:text-base leading-none truncate max-w-37.5 sm:max-w-95" title={name}>{name}</span>
			{#if isCategory}
				<Badge variant="primary" size="sm" rounded={false} class="border-0 bg-tertiary-600 text-white shadow-sm">Category</Badge>
			{:else}
				<Badge variant="error" size="sm" rounded={false} class="border-0 bg-error-600 text-white shadow-sm">Collection</Badge>
			{/if}

			<!-- Slug - Hidden on mobile to save space -->
			{#if item.slug}
				<Badge variant="surface" size="sm" rounded={false} class="hidden sm:inline-flex font-mono ms-auto opacity-80 shadow-sm" aria-label="URL slug">
					{item.slug}
				</Badge>
			{/if}
		</div>
	</div>

	<!-- Description: hidden on small screens -->
	{#if screen.isDesktop && item.description}
		<div class="flex-1 px-4 min-w-0 hidden md:flex justify-start">
			<span class="italic text-sm opacity-70 truncate w-full max-w-160 md:max-w-300 text-start" title={item.description}>
				{item.description}
			</span>
		</div>
	{/if}

	<!-- Action Buttons -->
	<div class="ms-auto flex shrink-0 items-center gap-0.5">
		<SystemTooltip title="Edit">
			{#if isCategory}
				<Button variant="ghost"
					type="button"
					onclick={(e: MouseEvent) => {
						e.stopPropagation();
						onEditCategory(item);
					}}
					aria-label="Edit {name}"
				 class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity hover:opacity-80">
					<iconify-icon icon="mdi:pencil" width={22} aria-hidden="true" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				</Button>
			{:else}
				<Button
					variant="ghost"
					size="sm"
					href={`/config/collectionbuilder/edit/${item.id}`}
					data-sveltekit-preload-data="hover"
					class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity hover:opacity-80"
					onclick={(e: MouseEvent) => e.stopPropagation()}
					aria-label="Edit {name}"
				>
					<iconify-icon icon="mdi:pencil" width={22} aria-hidden="true" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				</Button>
			{/if}
		</SystemTooltip>

		<!-- Duplicate -->
		<SystemTooltip title="Duplicate">
			<Button variant="ghost"
				type="button"
				onclick={(e: MouseEvent) => {
					e.stopPropagation();
					onDuplicate?.(item);
				}}
				aria-label="Duplicate {name}"
			 class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity hover:opacity-80">
				<iconify-icon icon="mdi:content-copy" width={22} aria-hidden="true"></iconify-icon>
			</Button>
		</SystemTooltip>

		<!-- Delete -->
		<SystemTooltip title="Delete">
			<Button variant="ghost"
				type="button"
				onclick={(e: MouseEvent) => {
					e.stopPropagation();
					onDelete?.(item);
				}}
				aria-label="Delete {name}"
			 class="flex min-h-8 min-w-8 items-center justify-center p-0! transition-opacity hover:opacity-80">
				<iconify-icon icon="mdi:delete" width={22} aria-hidden="true" class="text-error-500"></iconify-icon>
			</Button>
		</SystemTooltip>

		<!-- Drag affordance. Deliberately NOT a button: it has no click behaviour,
		     so a click here can never toggle a mode or move the row. Dragging is
		     handled by the draggable action on the row wrapper. Keyboard users
		     reorder with Alt+Arrow keys on the tree. -->
		<SystemTooltip title="Drag to reorder, or Alt+Arrow keys">
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
		outline: 3px solid var(--color-primary-500);
		outline-offset: 2px;
		border-radius: 0.25rem;
	}
</style>
