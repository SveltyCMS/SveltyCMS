<!--
@file src/components/MediaFolders.svelte
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
	// Lucide Icons
	import Folder from '@lucide/svelte/icons/folder';
	import Home from '@lucide/svelte/icons/home';
	import Pencil from '@lucide/svelte/icons/pencil';
	import CheckCircle from '@lucide/svelte/icons/check-circle';
	import AlertCircle from '@lucide/svelte/icons/circle-alert';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import FolderKanban from '@lucide/svelte/icons/folder-kanban';
	import Info from '@lucide/svelte/icons/info';

	// Using iconify-icon web component
	import { logger } from '@utils/logger';
	import { showToast } from '@utils/toast';
	import { ui } from '@stores/UIStore.svelte.ts';
	import { screen } from '@stores/screenSizeStore.svelte.ts';
	import TreeView from '@components/system/TreeView.svelte';
	import * as m from '@src/paraglide/messages';

	interface RawFolder {
		_id: string;
		name: string;
		path: string;
		parentId?: string | null;
		order?: number;
	}

	interface FolderNode {
		id: string;
		name: string;
		path: string;
		parentId?: string | null;
		isExpanded: boolean;
		onClick: () => void;
		children?: FolderNode[];
		icon?: string | import('svelte').Component<any>;
		nodeType: 'virtual';
		order: number;
		depth?: number;
	}

	// Mutable state
	let folders = $state<FolderNode[]>([]);
	let expandedNodes = $state<Set<string>>(new Set());
	let selectedFolderId = $state<string | null>(null);
	let isEditMode = $state(false);
	let isLoading = $state(true);
	let error = $state<string | null>(null);

	// Derived UI state
	let isSidebarFull = $derived(ui.state.leftSidebar === 'full');
	let isMobile = $derived(screen.isMobile);

	// Fetch folders from API
	async function loadFolders(): Promise<void> {
		isLoading = true;
		error = null;
		try {
			const res = await fetch('/api/systemVirtualFolder');
			if (!res.ok) throw new Error('Network error');
			const { success, data } = await res.json();
			if (!success || !data) throw new Error('Invalid response');

			folders = data
				.filter((f: RawFolder) => f.path?.startsWith('/'))
				.map((f: RawFolder) => ({
					id: f._id,
					name: f.name,
					path: f.path,
					parentId: f.parentId,
					isExpanded: expandedNodes.has(f._id),
					onClick: () => selectFolder(f._id),
					icon: Folder,
					nodeType: 'virtual' as const,
					order: f.order ?? 0
				}));
		} catch (err) {
			error = 'Failed to load folders';
			logger.error('[MediaFolders] Load error:', err);
			showToast('Failed to load folders', 'error');
		} finally {
			isLoading = false;
		}
	}

	// Build hierarchical tree
	let tree = $derived.by(() => {
		const root: FolderNode = {
			id: 'root',
			name: m.media_root_title(),
			path: '/',
			isExpanded: true,
			onClick: () => selectFolder('root'),
			icon: Home,
			nodeType: 'virtual',
			order: 0,
			depth: 0,
			children: []
		};

		if (folders.length === 0) return [root];

		const map = new Map<string, FolderNode>();
		folders.forEach((f) => map.set(f.id, { ...f, children: [], depth: 0 }));

		const orphans: FolderNode[] = [];
		folders.forEach((f) => {
			const node = map.get(f.id)!;
			if (f.parentId && map.has(f.parentId)) {
				map.get(f.parentId)!.children!.push(node);
			} else {
				orphans.push(node);
			}
		});

		function sortAndSetDepth(nodes: FolderNode[], depth: number): void {
			nodes.sort((a, b) => a.order - b.order);
			nodes.forEach((n) => {
				n.depth = depth;
				if (n.children?.length) sortAndSetDepth(n.children, depth + 1);
			});
		}

		sortAndSetDepth(orphans, 1);
		root.children = orphans;
		return [root];
	});

	function selectFolder(id: string): void {
		selectedFolderId = id;
		if (id !== 'root') expandedNodes.add(id);
		if (isMobile) ui.toggle('leftSidebar', 'hidden');
	}

	// Drag & drop reordering
	async function reorder(draggedId: string, targetId: string, position: 'before' | 'after' | 'inside'): Promise<void> {
		if (!isEditMode) return;

		let newParentId: string | null = null;
		if (position === 'inside') {
			newParentId = targetId === 'root' ? null : targetId;
		} else {
			const target = folders.find((f) => f.id === targetId);
			newParentId = target?.parentId ?? null;
		}

		try {
			const res = await fetch('/api/systemVirtualFolder', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'reorder',
					parentId: newParentId,
					orderUpdates: [{ folderId: draggedId, order: 0, parentId: newParentId }]
				})
			});

			if (!res.ok) throw new Error('Failed');
			showToast('Folder moved', 'success');
			await loadFolders();
		} catch (e) {
			showToast('Move failed', 'error');
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
	<!-- Header -->
	<div class="flex items-center justify-between">
		<h3 class="flex items-center gap-2 text-sm font-semibold text-tertiary-500 dark:text-primary-500">
			<FolderKanban size={20} />
			Media Folders
		</h3>

		{#if isSidebarFull}
			<button
				type="button"
				onclick={() => (isEditMode = !isEditMode)}
				class="btn-sm {isEditMode ? 'variant-filled-warning' : 'preset-outlined-surface-500'} flex items-center"
				aria-pressed={isEditMode}
			>
				{#if isEditMode}
					<CheckCircle size={16} />
				{:else}
					<Pencil size={16} />
				{/if}
				<span class="ml-1">{isEditMode ? 'Done' : 'Edit'}</span>
			</button>
		{/if}
	</div>

	<!-- Edit mode hint -->
	{#if isEditMode && isSidebarFull}
		<div class="flex items-start gap-2 rounded-lg bg-warning-500/10 p-3 text-xs text-warning-700 dark:text-warning-400">
			<Info size={16} class="shrink-0 mt-0.5" />
			<p>Drag folders to reorder or move. Use node actions for rename/delete.</p>
		</div>
	{/if}

	<!-- Content -->
	<div class="media-folders-list" role="tree" aria-label="Folder tree">
		{#if isLoading}
			<div class="flex flex-col items-center justify-center gap-3 p-6">
				<div class="flex gap-2">
					<div class="h-3 w-3 animate-bounce rounded-full bg-primary-500"></div>
					<div class="h-3 w-3 animate-bounce rounded-full bg-primary-500 [animation-delay:0.1s]"></div>
					<div class="h-3 w-3 animate-bounce rounded-full bg-primary-500 [animation-delay:0.2s]"></div>
				</div>
				<p class="text-sm text-surface-600 dark:text-surface-50">Loading folders...</p>
			</div>
		{:else if error}
			<div class="flex flex-col items-center justify-center gap-3 p-6 text-center">
				<AlertCircle size={32} class="text-error-500" />
				<p class="text-sm text-error-500">{error}</p>
				<button type="button" onclick={loadFolders} class="btn-sm preset-filled-error-500 flex items-center gap-2">
					<RefreshCw size={16} />
					Retry
				</button>
			</div>
		{:else if tree.length > 0}
			<TreeView
				nodes={tree}
				selectedId={selectedFolderId}
				compact={!isSidebarFull}
				iconColorClass="text-primary-500"
				showBadges={false}
				allowDragDrop={isEditMode}
				onReorder={reorder}
			/>
		{:else}
			<div class="flex flex-col items-center justify-center gap-2 p-6 text-center">
				<Folder size={32} class="opacity-20" />
				<p class="text-sm text-surface-500 dark:text-surface-50">No folders yet</p>
				<p class="text-xs text-surface-400">Create your first media folder to get started</p>
			</div>
		{/if}
	</div>
</div>

<style>
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
