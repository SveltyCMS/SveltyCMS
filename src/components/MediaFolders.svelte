<!--
@file src/components/MediaFolders.svelte
@component Media Folders Manager

Simple file-manager-like component for organizing media folders.

Features:
- Tree view of media folders
- Edit mode toggle for folder management
- Drag & drop to move folders (when edit mode is on)
- Rename and delete folders (when edit mode is on)
- Navigate folders by clicking
-->

<script lang="ts">
	import { goto } from '$app/navigation';

	// Stores
	import { screenSize } from '@stores/screenSizeStore.svelte';
	import { toggleUIElement, uiStateManager } from '@stores/UIStore.svelte';
	import { showToast } from '@utils/toast';

	// Components
	import TreeView from '@components/system/TreeView.svelte';

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

	// State
	let folders = $state<FolderNode[]>([]);
	let expandedNodes = $state<Set<string>>(new Set());
	let selectedFolderId = $state<string | null>(null);
	let isEditMode = $state(false);
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	// Derived
	let isSidebarFull = $derived(uiStateManager.uiState.value.leftSidebar === 'full');

	// Fetch folders
	async function fetchFolders() {
		isLoading = true;
		error = null;
		try {
			const response = await fetch('/api/systemVirtualFolder');
			const result = await response.json();

			if (result.success && result.data) {
				folders = result.data
					.filter((folder: any) => folder.path && folder.path.startsWith('/'))
					.map((folder: any) => ({
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
			}
		} catch (err) {
			error = 'Failed to load folders';
			console.error('Error fetching folders:', err);
		} finally {
			isLoading = false;
		}
	}

	// Build tree structure
	let folderTree = $derived.by(() => {
		const rootNode: FolderNode = {
			id: 'root',
			name: 'Media Root',
			path: '/',
			isExpanded: true,
			onClick: () => handleFolderClick('root'),
			icon: 'bi:house-door',
			nodeType: 'virtual',
			order: 0,
			depth: 0
		};

		if (folders.length === 0) return [rootNode];

		const folderMap = new Map<string, FolderNode>();
		folders.forEach((folder) => {
			folderMap.set(folder.id, {
				...folder,
				children: [],
				depth: 0
			});
		});

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

		// Set depths and sort
		const setDepth = (nodes: FolderNode[], depth: number) => {
			nodes.sort((a, b) => (a.order || 0) - (b.order || 0));
			nodes.forEach((node) => {
				node.depth = depth;
				if (node.children && node.children.length > 0) {
					setDepth(node.children, depth + 1);
				}
			});
		};
		setDepth(tree, 1);

		rootNode.children = tree;
		return [rootNode];
	});

	// Handle folder click
	function handleFolderClick(folderId: string) {
		selectedFolderId = folderId;

		if (folderId !== 'root') {
			expandedNodes = new Set([...expandedNodes, folderId]);
		}

		// Navigate to media gallery with folder
		const folderParam = folderId === 'root' ? '' : `?folderId=${folderId}`;
		goto(`/mediagallery${folderParam}`);

		// Close sidebar on mobile
		if (screenSize.value === 'SM') {
			toggleUIElement('leftSidebar', 'hidden');
		}
	}

	// Handle drag & drop
	async function handleDragDrop(draggedId: string, targetId: string, position: 'before' | 'after' | 'inside') {
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
				showToast('Folder moved successfully', 'success');
				await fetchFolders();
			} else {
				throw new Error('Failed to move folder');
			}
		} catch (error) {
			showToast('Failed to move folder', 'error');
			console.error('Error moving folder:', error);
		}
	}

	// Initialize
	$effect(() => {
		fetchFolders();

		// Listen for folder created/updated events
		const handleFolderUpdate = () => fetchFolders();
		document.addEventListener('folderCreated', handleFolderUpdate);

		return () => {
			document.removeEventListener('folderCreated', handleFolderUpdate);
		};
	});
</script>

<div class="media-folders-container">
	<!-- Header with Edit Mode Toggle -->
	<div class="mb-2 flex items-center justify-between">
		<h3 class="text-sm font-semibold text-surface-700 dark:text-surface-300">
			<iconify-icon icon="bi:folder" width="18" class="mr-1 text-primary-500"></iconify-icon>
			Media Folders
		</h3>

		{#if isSidebarFull}
			<button
				onclick={() => (isEditMode = !isEditMode)}
				class="btn btn-sm {isEditMode ? 'variant-filled-warning' : 'variant-ghost-surface'}"
				title={isEditMode ? 'Exit Edit Mode' : 'Enter Edit Mode'}
			>
				<iconify-icon icon={isEditMode ? 'bi:check-circle' : 'bi:pencil'} width="16"></iconify-icon>
				{isEditMode ? 'Done' : 'Edit'}
			</button>
		{/if}
	</div>

	<!-- Edit Mode Info -->
	{#if isEditMode && isSidebarFull}
		<div class="mb-2 rounded bg-warning-500/10 p-2 text-xs text-warning-700 dark:text-warning-400">
			<iconify-icon icon="bi:info-circle" width="14" class="mr-1"></iconify-icon>
			Drag folders to move them
		</div>
	{/if}

	<!-- Loading State -->
	{#if isLoading}
		<div class="p-4 text-center">
			<div class="flex items-center justify-center space-x-2">
				<div class="h-4 w-4 animate-bounce rounded-full bg-primary-500"></div>
				<div class="h-4 w-4 animate-bounce rounded-full bg-primary-500" style="animation-delay: 0.1s"></div>
				<div class="h-4 w-4 animate-bounce rounded-full bg-primary-500" style="animation-delay: 0.2s"></div>
			</div>
			<p class="mt-2 text-sm text-surface-600">Loading folders...</p>
		</div>

		<!-- Error State -->
	{:else if error}
		<div class="p-4 text-center text-error-500">
			<iconify-icon icon="ic:outline-error" width="24"></iconify-icon>
			<p class="mt-1 text-sm">{error}</p>
			<button class="variant-filled-error btn btn-sm mt-2" onclick={fetchFolders}>Retry</button>
		</div>

		<!-- Folder Tree -->
	{:else if folderTree.length > 0}
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

		<!-- Empty State -->
	{:else}
		<div class="p-4 text-center text-surface-500">
			<iconify-icon icon="bi:folder" width="32" class="opacity-50"></iconify-icon>
			<p class="mt-2 text-sm">No folders yet</p>
		</div>
	{/if}
</div>

<style>
	.media-folders-container {
		scrollbar-width: thin;
		scrollbar-color: rgba(var(--color-primary-500) / 0.3) transparent;
	}
</style>
