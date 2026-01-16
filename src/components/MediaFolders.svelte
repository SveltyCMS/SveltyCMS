<!--
@file src/components/MediaFolders.svelte
@component Media Folders Manager

Simple file-manager-like component for organizing media folders.

@example
<MediaFolders />

#### Features
- Tree view of media folders with hierarchical structure
- Edit mode toggle for folder management
- Drag & drop to move folders (when edit mode is on)
- Rename and delete folders (when edit mode is on)
- Navigate folders by clicking
- Persistent expanded state
- Responsive design with mobile support
- Loading and error states
-->

<script lang="ts">
	import { logger } from '@utils/logger';

	// Stores
	import { screenSize } from '@stores/screenSizeStore.svelte';
	import { toggleUIElement, uiStateManager } from '@stores/UIStore.svelte';

	// Utils
	import { toaster } from '@stores/store.svelte';

	// Components
	import TreeView from '@components/system/TreeView.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Types
	interface FolderNode {
		id: string;
		name: string;
		path: string;
		parentId?: string | null;
		isExpanded: boolean;
		onClick: () => void;
		children?: FolderNode[];
		icon?: string;
		nodeType: 'virtual';
		order: number;
		depth?: number;
	}

	interface RawFolder {
		_id: string;
		name: string;
		path: string;
		parentId?: string | null;
		order?: number;
	}

	// State
	let folders = $state<FolderNode[]>([]);
	let expandedNodes = $state<Set<string>>(new Set());
	let selectedFolderId = $state<string | null>(null);
	let isEditMode = $state(false);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	// Derived states
	const isSidebarFull = $derived(uiStateManager.uiState.value.leftSidebar === 'full');
	const isMobile = $derived(screenSize.value === 'SM');

	/**
	 * Fetch folders from API
	 */
	async function fetchFolders(): Promise<void> {
		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/systemVirtualFolder');
			const result = await response.json();

			if (result.success && result.data) {
				folders = result.data
					.filter((folder: RawFolder) => folder.path && folder.path.startsWith('/'))
					.map((folder: RawFolder) => ({
						id: folder._id,
						name: folder.name,
						path: folder.path,
						parentId: folder.parentId,
						isExpanded: expandedNodes.has(folder._id),
						onClick: () => handleFolderClick(folder._id),
						icon: 'bi:folder',
						nodeType: 'virtual' as const,
						order: folder.order || 0
					}));
			} else {
				throw new Error('Invalid response format');
			}
		} catch (err) {
			error = 'Failed to load folders';
			logger.error('Error fetching folders:', err);
			toaster.error({ description: 'Failed to load folders' });
		} finally {
			isLoading = false;
		}
	}

	/**
	 * Build hierarchical folder tree structure
	 */
	const folderTree = $derived.by(() => {
		const rootNode: FolderNode = {
			id: 'root',
			name: m.media_root_title(),
			path: '/',
			isExpanded: true,
			onClick: () => handleFolderClick('root'),
			icon: 'bi:house-door',
			nodeType: 'virtual',
			order: 0,
			depth: 0
		};

		if (folders.length === 0) return [rootNode];

		// Create folder map
		const folderMap = new Map<string, FolderNode>();
		folders.forEach((folder) => {
			folderMap.set(folder.id, {
				...folder,
				children: [],
				depth: 0
			});
		});

		// Build tree structure
		const tree: FolderNode[] = [];
		folders.forEach((folder) => {
			const node = folderMap.get(folder.id)!;
			if (folder.parentId && folderMap.has(folder.parentId)) {
				const parent = folderMap.get(folder.parentId)!;
				if (!parent.children) parent.children = [];
				parent.children.push(node);
			} else {
				tree.push(node);
			}
		});

		// Set depths and sort recursively
		function setDepthAndSort(nodes: FolderNode[], depth: number): void {
			nodes.sort((a, b) => (a.order || 0) - (b.order || 0));
			nodes.forEach((node) => {
				node.depth = depth;
				if (node.children && node.children.length > 0) {
					setDepthAndSort(node.children, depth + 1);
				}
			});
		}

		setDepthAndSort(tree, 1);

		rootNode.children = tree;
		return [rootNode];
	});

	/**
	 * Handle folder click - expand and update state
	 * Navigation is handled by <a> tag in TreeView
	 */
	function handleFolderClick(folderId: string): void {
		selectedFolderId = folderId;

		// Expand parent folders
		if (folderId !== 'root') {
			expandedNodes = new Set([...expandedNodes, folderId]);
		}

		// Close sidebar on mobile (navigation happens via link)
		if (isMobile) {
			toggleUIElement('leftSidebar', 'hidden');
		}
	}

	// Handle drag & drop folder reordering
	async function handleDragDrop(draggedId: string, targetId: string, position: 'before' | 'after' | 'inside'): Promise<void> {
		if (!isEditMode) return;

		try {
			let newParentId: string | null = null;

			if (position === 'inside') {
				newParentId = targetId === 'root' ? null : targetId;
			} else {
				const targetFolder = folders.find((f) => f.id === targetId);
				newParentId = targetFolder?.parentId || null;
			}

			const response = await fetch('/api/systemVirtualFolder', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'reorder',
					parentId: newParentId,
					orderUpdates: [
						{
							folderId: draggedId,
							order: 0,
							parentId: newParentId
						}
					]
				})
			});

			if (response.ok) {
				toaster.success({ description: 'Folder moved successfully' });
				await fetchFolders();
			} else {
				throw new Error('Failed to move folder');
			}
		} catch (error) {
			toaster.error({ description: 'Failed to move folder' });
			logger.error('Error moving folder:', error);
		}
	}

	// Toggle edit mode
	function toggleEditMode(): void {
		isEditMode = !isEditMode;
	}

	// Effects

	// Initialize and listen for folder updates
	$effect(() => {
		fetchFolders();

		const handleFolderUpdate = () => fetchFolders();
		document.addEventListener('folderCreated', handleFolderUpdate);
		document.addEventListener('folderUpdated', handleFolderUpdate);
		document.addEventListener('folderDeleted', handleFolderUpdate);

		return () => {
			document.removeEventListener('folderCreated', handleFolderUpdate);
			document.removeEventListener('folderUpdated', handleFolderUpdate);
			document.removeEventListener('folderDeleted', handleFolderUpdate);
		};
	});
</script>

<div class="space-y-2" role="navigation" aria-label="Media folders navigation">
	<!-- Header with Edit Mode Toggle -->
	<div class="flex items-center justify-between">
		<h3 class="flex items-center text-sm font-semibold text-surface-700 dark:text-surface-300">
			<iconify-icon icon="bi:folder" width="18" class="mr-1 text-primary-500" aria-hidden="true"></iconify-icon>
			Media Folders
		</h3>

		{#if isSidebarFull}
			<button
				type="button"
				onclick={toggleEditMode}
				class="btn btn-sm transition-colors {isEditMode ? 'preset-filled-warning-500' : 'preset-ghost-surface-500'}"
				title={isEditMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
				aria-pressed={isEditMode}
			>
				<iconify-icon icon={isEditMode ? 'bi:check-circle' : 'bi:pencil'} width="16" aria-hidden="true"></iconify-icon>
				<span class="ml-1">{isEditMode ? 'Done' : 'Edit'}</span>
			</button>
		{/if}
	</div>

	<!-- Edit Mode Info Banner -->
	{#if isEditMode && isSidebarFull}
		<div
			class="flex items-start space-x-2 rounded-lg bg-warning-500/10 p-3 text-xs text-warning-700 dark:text-warning-400"
			role="status"
			aria-live="polite"
		>
			<iconify-icon icon="bi:info-circle" width="14" class="mt-0.5 shrink-0" aria-hidden="true"></iconify-icon>
			<p>Drag folders to move them. Click to manage folder settings.</p>
		</div>
	{/if}

	<!-- Folder Tree Content -->
	<div class="media-folders-list" role="tree" aria-label="Media folder tree">
		{#if isLoading}
			<!-- Loading State -->
			<div class="flex flex-col items-center justify-center space-y-3 p-6" role="status" aria-live="polite">
				<div class="flex items-center justify-center space-x-2">
					<div class="h-3 w-3 animate-bounce rounded-full bg-primary-500"></div>
					<div class="h-3 w-3 animate-bounce rounded-full bg-primary-500" style="animation-delay: 0.1s"></div>
					<div class="h-3 w-3 animate-bounce rounded-full bg-primary-500" style="animation-delay: 0.2s"></div>
				</div>
				<p class="text-sm text-surface-600 dark:text-surface-400">Loading folders...</p>
			</div>
		{:else if error}
			<!-- Error State -->
			<div class="flex flex-col items-center justify-center space-y-3 p-6 text-center" role="alert" aria-live="assertive">
				<iconify-icon icon="ic:outline-error" width="32" class="text-error-500" aria-hidden="true"></iconify-icon>
				<p class="text-sm text-error-500">{error}</p>
				<button type="button" class="preset-filled-error-500 btn btn-sm" onclick={fetchFolders}>
					<iconify-icon icon="ic:outline-refresh" width="16" class="mr-1" aria-hidden="true"></iconify-icon>
					Retry
				</button>
			</div>
		{:else if folderTree.length > 0}
			<!-- Folder Tree View -->
			<TreeView
				k={0}
				nodes={folderTree}
				selectedId={selectedFolderId}
				compact={!isSidebarFull}
				iconColorClass="text-primary-500"
				showBadges={false}
				allowDragDrop={isEditMode}
				onReorder={handleDragDrop}
			/>
		{:else}
			<!-- Empty State -->
			<div class="flex flex-col items-center justify-center space-y-2 p-6 text-center">
				<iconify-icon icon="bi:folder" width="32" class="text-surface-400 opacity-50" aria-hidden="true"></iconify-icon>
				<p class="text-sm text-surface-500 dark:text-surface-400">No folders yet</p>
				<p class="text-xs text-surface-400">Create your first media folder to get started</p>
			</div>
		{/if}
	</div>
</div>

<style>
	/* Custom scrollbar styling */
	.media-folders-list {
		scrollbar-width: thin;
		scrollbar-color: rgb(var(--color-primary-500) / 0.3) transparent;
	}

	.media-folders-list::-webkit-scrollbar {
		width: 4px;
	}

	.media-folders-list::-webkit-scrollbar-thumb {
		background-color: rgb(var(--color-primary-500) / 0.3);
		border-radius: 2px;
	}

	.media-folders-list::-webkit-scrollbar-thumb:hover {
		background-color: rgb(var(--color-primary-500) / 0.5);
	}
</style>
