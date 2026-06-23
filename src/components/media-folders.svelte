<!--
@file src/components/media-folders.svelte
@component MediaFolders – Tree-based media folder navigation & management

@features
- Hierarchical tree view with root node
- Click navigation (closes sidebar on mobile)
- Edit mode: drag & drop reordering, rename/delete via TreeView
- Persistent loading/error/empty states
- Responsive (compact mode when sidebar narrow)
- Event-driven refresh on folder changes
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import TreeView from '@components/ui/tree-view.svelte';
	import { media_root_title } from '@src/paraglide/messages';
	import { screen } from '@src/stores/screen-size-store.svelte.ts';
	import { ui } from '@src/stores/ui-store.svelte.ts';
	// Using iconify-icon web component
	import { logger } from '@utils/logger';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { pinnedStore } from '@src/stores/pinned-store.svelte';
	import { page } from '$app/state';

	interface RawFolder {
		_id: string;
		name: string;
		order?: number;
		parentId?: string | null;
		path: string;
	}

	interface FolderNode {
		children?: FolderNode[];
		depth?: number;
		icon?: string;
		id: string;
		isExpanded: boolean;
		name: string;
		nodeType: 'virtual';
		onClick: () => void;
		order: number;
		parentId?: string | null;
		path: string;
		actions?: {
			icon: string;
			label: string;
			onClick: (node: any, event: MouseEvent) => void;
			colorClass?: string;
		}[];
	}

	// Mutable state
	let folders = $state<FolderNode[]>([]);
	// Seed with 'root' so the tree root starts expanded and its folders are visible.
	let expandedNodes = $state(new SvelteSet<string>(['root']));
	let selectedFolderId = $derived(page.url.searchParams.get('folderId') || 'root');
	let isEditMode = $state(false);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let search = $state('');

	// Derived UI state
	let isSidebarFull = $derived(ui.state.leftSidebar === 'full');
	let isMobile = $derived(screen.isMobile);

	// Fetch folders from API
	async function loadFolders(): Promise<void> {
		isLoading = true;
		error = null;
		try {
			// Cache-bust: the API layer caches GET /api/system-* responses for 300s,
			// so a freshly created/renamed/deleted folder would otherwise not appear
			// until the cache expired. A unique query param sidesteps the L1 cache.
			const res = await fetch(`/api/system-virtual-folder?t=${Date.now()}`);
			if (!res.ok) {
				throw new Error('Network error');
			}
			const { success, data } = await res.json();
			if (!(success && data)) {
				throw new Error('Invalid response');
			}

			folders = data
				.filter((f: RawFolder) => f.path?.startsWith('/'))
				.map((f: RawFolder) => ({
					id: f._id,
					name: f.name,
					path: f.path,
					parentId: f.parentId,
					isExpanded: expandedNodes.has(f._id),
					onClick: () => selectFolder(f._id),
					icon: 'bi:folder',
					nodeType: 'virtual' as const,
					order: f.order ?? 0
				}));
		} catch (err) {
			error = 'Failed to load folders';
			logger.error('[MediaFolders] Load error:', err);
			toast.error('Failed to load folders');
		} finally {
			isLoading = false;
		}
	}

	// Build hierarchical tree
	let tree = $derived.by(() => {
		const isRootPinned = pinnedStore.isPinned('root');
		const root: FolderNode = {
			id: 'root',
			name: media_root_title(),
			path: '/',
			isExpanded: true,
			onClick: () => selectFolder('root'),
			icon: 'bi:house-door',
			nodeType: 'virtual',
			order: 0,
			depth: 0,
			children: [],
			actions: [
				{
					icon: isRootPinned ? 'bi:pin-angle-fill' : 'bi:pin-angle',
					label: isRootPinned ? 'Unpin Folder' : 'Pin Folder',
					colorClass: isRootPinned ? 'text-tertiary-500 dark:text-primary-500' : 'text-surface-500',
					onClick: (_treeNode: any, _event: MouseEvent) => {
						pinnedStore.togglePin({
							id: 'root',
							name: media_root_title(),
							type: 'folder',
							path: '/mediagallery',
							icon: 'bi:house-door'
						});
					}
				}
			]
		};

		if (folders.length === 0) {
			return [root];
		}

		const searchLower = search.toLowerCase();
		const filteredFolders = search 
			? folders.filter(f => f.name.toLowerCase().includes(searchLower))
			: folders;

		const map = new SvelteMap<string, FolderNode>();
		filteredFolders.forEach((f) => {
			const isPinned = pinnedStore.isPinned(f.id);
			map.set(f.id, {
				...f,
				children: [],
				depth: 0,
				actions: [
					{
						icon: isPinned ? 'bi:pin-angle-fill' : 'bi:pin-angle',
						label: isPinned ? 'Unpin Folder' : 'Pin Folder',
						colorClass: isPinned ? 'text-tertiary-500 dark:text-primary-500' : 'text-surface-500',
						onClick: (_treeNode: any, _event: MouseEvent) => {
							pinnedStore.togglePin({
								id: f.id,
								name: f.name,
								type: 'folder',
								path: `/mediagallery?folderId=${f.id}`,
								icon: 'bi:folder'
							});
						}
					}
				]
			});
		});

		const orphans: FolderNode[] = [];
		filteredFolders.forEach((f) => {
			const node = map.get(f.id)!;
			if (f.parentId && map.has(f.parentId)) {
				map.get(f.parentId)?.children?.push(node);
			} else {
				orphans.push(node);
			}
		});

		function sortAndSetDepth(nodes: FolderNode[], depth: number): void {
			nodes.sort((a, b) => a.order - b.order);
			nodes.forEach((n) => {
				n.depth = depth;
				if (n.children?.length) {
					sortAndSetDepth(n.children, depth + 1);
				}
			});
		}

		sortAndSetDepth(orphans, 1);
		root.children = orphans;
		return [root];
	});

	function selectFolder(id: string): void {
		if (id !== 'root') {
			expandedNodes.add(id);
		}
		if (isMobile) {
			ui.toggle('leftSidebar', 'collapsed');
		}
		const path = id === 'root' ? '/mediagallery' : `/mediagallery?folderId=${id}`;
		goto(path);
	}

	// Drag & drop reordering
	async function reorder(draggedId: string, targetId: string, position: 'before' | 'after' | 'inside'): Promise<void> {
		if (!isEditMode) {
			return;
		}

		let newParentId: string | null = null;
		if (position === 'inside') {
			newParentId = targetId === 'root' ? null : targetId;
		} else {
			const target = folders.find((f) => f.id === targetId);
			newParentId = target?.parentId ?? null;
		}

		try {
			const res = await fetch('/api/system-virtual-folder', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': page.data.csrfToken ?? '' },
				body: JSON.stringify({
					action: 'reorder',
					parentId: newParentId,
					orderUpdates: [{ folderId: draggedId, order: 0, parentId: newParentId }]
				})
			});

			if (!res.ok) {
				throw new Error('Failed');
			}
			toast.success('Folder moved');
			await loadFolders();
		} catch (e) {
			toast.error('Move failed');
			logger.error('[MediaFolders] Reorder error:', e);
		}
	}

	// Initial load + refresh on global events
	$effect(() => {
		loadFolders();

		const refresh = () => loadFolders();
		document.addEventListener('folderCreated', refresh);
		document.addEventListener('folderUpdated', refresh);
		document.addEventListener('folderDeleted', refresh);

		return () => {
			document.removeEventListener('folderCreated', refresh);
			document.removeEventListener('folderUpdated', refresh);
			document.removeEventListener('folderDeleted', refresh);
		};
	});
</script>

<div class="space-y-2" role="navigation" aria-label="Media folders">
	<!-- Search Header -->
	<div class="flex items-center gap-1">
		<div class="relative w-full min-w-0">
			<input
				type="text"
				bind:value={search}
				size="1"
				placeholder="Search folders..."
				class="w-full min-w-0 rounded border border-surface-300 bg-surface-50 px-3 {isSidebarFull ? 'pe-11' : 'pe-2'} text-sm outline-none transition-all hover:border-surface-400 focus:border-tertiary-500 dark:border-surface-600 dark:bg-surface-800 h-10 py-2"
				aria-label="Search media folders"
			/>
			{#if isSidebarFull && search}
				<div class="absolute inset-e-0 top-0 flex h-full items-center">
					<Button variant="outline"
						type="button"
						onclick={() => search = ''}
						aria-label="Clear search"
					 class="rounded-full preset-outline-surface-500 h-9 w-9 mt-0.5 me-0.5">
						<iconify-icon icon="ic:round-close" width={24}></iconify-icon>
					</Button>
				</div>
			{:else if isSidebarFull && !search}
				<div class="absolute inset-e-0 top-0 flex h-full items-center">
					<div class="flex items-center justify-center rounded-e bg-secondary-100 dark:bg-surface-700 h-9 w-9 mt-0.5 me-0.5">
						<iconify-icon icon="ic:outline-search" width={24}></iconify-icon>
					</div>
				</div>
			{/if}
		</div>
		{#if isSidebarFull}
			<Button variant="warning"
				type="button"
				onclick={() => (isEditMode = !isEditMode)}
				aria-pressed={isEditMode}
				aria-label="Toggle Edit Mode"
				title="Edit Folders"
			 class="p-0! min-w-0 h-10 w-10 shrink-0 {isEditMode ? ' ' : ' '}">
				<iconify-icon icon={isEditMode ? 'bi:check-circle' : 'bi:pencil'} width="16"></iconify-icon>
			</Button>
		{/if}
	</div>

	<!-- Edit mode hint -->
	{#if isEditMode && isSidebarFull}
		<div class="flex items-start gap-2 rounded bg-warning-500/10 p-3 text-xs text-warning-700 dark:text-warning-400">
			<iconify-icon icon="bi:info-circle" width={24}></iconify-icon>
			<p>Drag folders to reorder or move. Use node actions for rename/delete.</p>
		</div>
	{/if}

	<!-- Content -->
	<div class="media-folders-list" role="tree" aria-label="Folder tree">
		{#if isLoading}
			<div class="flex flex-col items-center justify-center gap-3 p-6">
				<div class="flex gap-2">
					<div class="h-3 w-3 animate-bounce rounded-full bg-tertiary-500 dark:bg-primary-500"></div>
					<div class="h-3 w-3 animate-bounce rounded-full bg-tertiary-500 dark:bg-primary-500 [animation-delay:0.1s]"></div>
					<div class="h-3 w-3 animate-bounce rounded-full bg-tertiary-500 dark:bg-primary-500 [animation-delay:0.2s]"></div>
				</div>
				<p class="text-sm text-surface-600 dark:text-surface-50">Loading folders...</p>
			</div>
		{:else if error}
			<div class="flex flex-col items-center justify-center gap-3 p-6 text-center">
				<iconify-icon icon="ic:outline-error" width={24}></iconify-icon>
				<p class="text-sm text-error-500">{error}</p>
				<Button variant="error" type="button" onclick={loadFolders} size="sm">
					<iconify-icon icon="ic:outline-refresh" width={24}></iconify-icon>
					Retry
				</Button>
			</div>
		{:else if tree.length > 0}
			<TreeView
				nodes={tree}
				bind:expandedIds={expandedNodes}
				selectedId={selectedFolderId}
				compact={!isSidebarFull}
				iconColorClass="text-tertiary-500 dark:text-primary-500"
				showBadges={false}
				allowDragDrop={isEditMode}
				onReorder={reorder}
			/>
		{:else}
			<div class="flex flex-col items-center justify-center gap-2 p-6 text-center">
				<iconify-icon icon="bi:folder" width={24}></iconify-icon>
				<p class="text-sm text-surface-500 dark:text-surface-50">No folders yet</p>
				<p class="text-xs text-surface-400">Create your first media folder to get started</p>
			</div>
		{/if}
	</div>
</div>

<style>
	.media-folders-list {
		scrollbar-color: rgb(var(--color-primary-500) / 0.3) transparent;
		scrollbar-width: thin;
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
