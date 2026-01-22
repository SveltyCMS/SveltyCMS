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
-->

<script lang="ts">
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';

	// Using iconify-icon web component
	import { goto } from '$app/navigation';
	import type { TreeViewItem } from '@utils/treeViewAdapter';
	import { screen } from '@stores/screenSizeStore.svelte.ts';
	// Tree View

	interface Props {
		item: TreeViewItem & { hasChildren?: boolean };
		isOpen?: boolean;
		toggle?: () => void;
		onEditCategory: (item: TreeViewItem) => void;
		onDelete?: (item: TreeViewItem) => void;
		onDuplicate?: (item: TreeViewItem) => void;
	}

	let { item, isOpen, toggle, onEditCategory, onDelete, onDuplicate }: Props = $props();

	// Computed properties
	const name = $derived(item.name || 'Untitled');
	const icon = $derived(item.icon || (item.nodeType === 'category' ? 'bi:folder' : 'bi:collection'));
	const isCategory = $derived(item.nodeType === 'category');

	// Enhanced styling with better visual hierarchy
	const containerClass = $derived(
		isCategory
			? 'group w-full min-h-[48px] p-2 sm:p-3 rounded bg-gradient-to-r from-tertiary-500/10 to-tertiary-600/5 border-2 border-tertiary-500/30 flex items-center gap-2 sm:gap-3 mb-2 cursor-pointer hover:border-tertiary-500 hover:shadow-lg hover:from-tertiary-500/20 hover:to-tertiary-600/10 transition-all duration-300 ease-out min-w-0 overflow-hidden'
			: 'group w-full min-h-[48px] p-2 sm:p-3 rounded bg-gradient-to-r from-surface-100 to-surface-50 dark:from-surface-700 dark:to-surface-800 border-2 border-l-4 border-surface-500/40 border-l-surface-500 flex items-center gap-2 sm:gap-3 mb-2 cursor-pointer hover:border-surface-500 hover:shadow-lg hover:translate-x-1 transition-all duration-300 ease-out min-w-0 overflow-hidden'
	);

	const iconClass = $derived(
		isCategory
			? 'text-tertiary-500 group-hover:text-tertiary-600 transition-colors duration-200'
			: 'text-error-500 group-hover:text-error-600 transition-colors duration-200'
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
			class="btn-icon preset-tonal-surface-500 hover:preset-filled-surface-500 transition-all duration-200 hover:scale-110"
			onclick={(e) => {
				e.stopPropagation();
				console.log('Toggle clicked', { toggle, isOpen });
				toggle?.();
			}}
			aria-label={isOpen ? 'Collapse' : 'Expand'}
		>
			{#if isOpen ? 'bi:chevron-down' : ('bi:chevron-right' as keyof typeof iconsData)}<Icon
					icon={isOpen ? 'bi:chevron-down' : ('bi:chevron-right' as keyof typeof iconsData)}
					size={20}
					class="transition-transform duration-200"
				/>{/if}
		</button>
	{:else}
		<div class="w-10"></div>
	{/if}

	<!-- Icon with Animation -->
	<div class="relative">
		{#if icon as keyof typeof iconsData}<Icon
				icon={icon as keyof typeof iconsData}
				size={24}
				class={iconClass}
			/>{/if}
		{#if isCategory}
			<div class="absolute -top-1 -right-1 w-2 h-2 bg-tertiary-500 rounded-full animate-pulse"></div>
		{/if}
	</div>

	<!-- Name & Badge Section -->
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
					class="badge font-semibold bg-surface-500 text-white text-[9px] sm:text-[10px] px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-sm uppercase shadow-sm"
				>
					Collection
				</span>
			{/if}
		</div>
	</div>

	<!-- Description with Tooltip - hidden on mobile -->
	{#if screen.isDesktop}
		<div class="flex-1 px-4 min-w-0 flex justify-start">
			{#if item.description}
				<div class="relative group/desc">
					<span
						class="italic text-sm opacity-70 truncate w-full max-w-[500px] text-left hover:opacity-100 transition-opacity duration-200"
						title={item.description}
					>
						{item.description}
					</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- Slug Badge -->
	{#if item.slug}
		<span class="badge bg-surface-200 dark:bg-surface-700 text-surface-900 dark:text-surface-100 px-3 py-1 rounded-sm font-mono text-xs shadow-sm">
			/{item.slug}
		</span>
	{/if}

	<!-- Action Buttons with Enhanced Design -->
	<div class="flex gap-1 sm:gap-2 ml-auto shrink-0 transition-opacity duration-200">
		<!-- Edit Button -->
		<button
			type="button"
			class="btn-icon preset-tonal-surface-500 hover:preset-filled-surface-500 rounded transition-all duration-200 hover:scale-110"
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
			<CircleQuestionMark size={24} />
		</button>

		<!-- Duplicate Button -->
		<button
			type="button"
			class="btn-icon preset-tonal-surface-500 hover:preset-filled-surface-500 rounded transition-all duration-200 hover:scale-110"
			onclick={(e) => {
				e.stopPropagation();
				onDuplicate?.(item);
			}}
			title="Duplicate"
		>
			<Copy size={24} />
		</button>

		<!-- Delete Button -->
		<button
			type="button"
			class="btn-icon preset-tonal-surface-500 hover:preset-filled-surface-500 rounded transition-all duration-200 hover:scale-110"
			onclick={(e) => {
				e.stopPropagation();
				onDelete?.(item);
			}}
			title="Delete"
		>
			<CircleQuestionMark size={24} />
		</button>

		<!-- Drag Handle with Enhanced Visual -->
		<div
			class="btn-icon preset-tonal-surface-500 rounded cursor-grab active:cursor-grabbing opacity-60 hover:opacity-100 flex items-center justify-center ml-2 hover:bg-surface-300 dark:hover:bg-surface-600 transition-all duration-200 hover:scale-110"
			aria-hidden="true"
			title="Drag to reorder"
		>
			<CircleQuestionMark size={24} />
		</div>
	</div>
</div>

<style>
	/* Enhance focus states for accessibility */
	div[role='button']:focus-visible {
		outline: 3px solid rgb(var(--color-primary-500));
		outline-offset: 4px;
		border-radius: 0.5rem;
	}

	/* Smooth badge animations */
	.badge {
		transition: all 0.2s ease;
	}

	.group:hover .badge {
		transform: translateY(-1px);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
	}

	/* Icon pulse animation for categories */
	@keyframes pulse {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}

	/* Action button enhancements */
	button.btn-icon {
		position: relative;
		overflow: hidden;
	}

	button.btn-icon::before {
		content: '';
		position: absolute;
		inset: 0;
		background: radial-gradient(circle, rgba(255, 255, 255, 0.2) 0%, transparent 70%);
		opacity: 0;
		transition: opacity 0.3s ease;
	}

	button.btn-icon:hover::before {
		opacity: 1;
	}

	/* Description tooltip enhancement */
	.group\/desc:hover span {
		z-index: 10;
		position: relative;
	}
</style>
