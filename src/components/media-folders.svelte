<!--
@file src/components/media-folders.svelte
@component MediaFolders – Tree-based media folder navigation & management

### Features:
- Hierarchical tree view with root node
- Click navigation (closes sidebar on mobile)
- Edit mode: drag & drop reordering, rename/delete via TreeView
- Accept media drag-and-drop from media-grid (move into virtual folder)
- Persistent loading/error/empty states
- Responsive (compact mode when sidebar narrow)
- Event-driven refresh on folder changes
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import TreeView from '@components/ui/tree-view.svelte';
	import { media_root_title } from '@src/paraglide/messages';
	import { screen } from '@src/stores/screen-size-store.svelte.ts';
	import { ui } from '@src/stores/ui-store.svelte.ts';
	import { logger } from '@utils/logger';
	import { toast } from '@src/stores/toast.svelte.ts';
	import {
		getMediaDragPayload,
		hasMediaDrag,
		moveMediaToFolder,
	} from '@utils/media/media-dnd';
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
		name: string;
		nodeType: 'virtual';
		onClick?: () => void;
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
	let rootExpanded = $state(true);
	let folderExpanded = $state(new SvelteSet<string>());
	let activeFolderId = $state('root');
	let isEditMode = $state(false);
	let isLoading = $state(true);
	let error = $state<string | null>(null);
	let search = $state('');
	/** Folder id currently highlighted as a media drop target (`root` for media root) */
	let mediaDropTargetId = $state<string | null>(null);
	let isMovingMedia = $state(false);

	// Derived UI state
	let isSidebarFull = $derived(ui.state.leftSidebar === 'full');
	let isMobile = $derived(screen.isMobile);

	function setFolderExpanded(id: string, open: boolean): void {
		const next = new SvelteSet(folderExpanded);
		if (open) {
			next.add(id);
		} else {
			next.delete(id);
		}
		folderExpanded = next;
	}

	function isFolderExpanded(id: string): boolean {
		return folderExpanded.has(id);
	}

	// Sync selection from URL (browser back/forward)
	$effect(() => {
		activeFolderId = page.url.searchParams.get('folderId') || 'root';
	});

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
					icon: 'mdi:folder-outline',
					nodeType: 'virtual' as const,
					order: f.order ?? 0,
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
		const root: FolderNode = {
			id: 'root',
			name: media_root_title(),
			path: '/',
			icon: 'mdi:home-outline',
			nodeType: 'virtual',
			order: 0,
			depth: 0,
			children: [],
			onClick: () => selectFolder('root'),
		};

		if (folders.length === 0) {
			return [root];
		}

		const searchLower = search.toLowerCase();
		const filteredFolders = search
			? folders.filter((f) => f.name.toLowerCase().includes(searchLower))
			: folders;

		const map = new SvelteMap<string, FolderNode>();
		filteredFolders.forEach((f) => {
			const isPinned = pinnedStore.isPinned(f.id);
			map.set(f.id, {
				...f,
				icon: 'mdi:folder-outline',
				children: [],
				depth: 0,
				onClick: () => selectFolder(f.id),
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
								icon: 'mdi:folder-outline',
							});
						},
					},
				],
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

	function expandAncestorChain(id: string): void {
		let current = folders.find((f) => f.id === id);
		while (current?.parentId) {
			setFolderExpanded(current.parentId, true);
			current = folders.find((f) => f.id === current!.parentId);
		}
	}

	function selectFolder(id: string): void {
		const resolved = id === 'root' ? 'root' : id;
		activeFolderId = resolved;
		if (resolved === 'root') {
			rootExpanded = true;
		} else {
			expandAncestorChain(resolved);
			setFolderExpanded(resolved, true);
		}
		if (isMobile) {
			ui.toggle('leftSidebar', 'collapsed');
		}
		const path = resolved === 'root' ? '/mediagallery' : `/mediagallery?folderId=${resolved}`;
		goto(path);
	}

	function handleRootClick(): void {
		if (activeFolderId !== 'root') {
			selectFolder('root');
			return;
		}
		if ((tree[0]?.children?.length ?? 0) > 0) {
			rootExpanded = !rootExpanded;
		}
	}

	function handleFolderClick(node: FolderNode): void {
		selectFolder(node.id);
	}

	function toggleFolderBranch(node: FolderNode, event: MouseEvent): void {
		event.stopPropagation();
		setFolderExpanded(node.id, !isFolderExpanded(node.id));
	}

	// Drag & drop reordering (folder → folder, edit mode only)
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

	// ── Media drag → folder drop (grid assets into virtual folders) ──────────

	function clearMediaDropTarget(): void {
		mediaDropTargetId = null;
	}

	function handleMediaDragOver(e: DragEvent, folderId: string): void {
		if (!hasMediaDrag(e.dataTransfer)) return;
		e.preventDefault();
		e.stopPropagation();
		if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
		if (mediaDropTargetId !== folderId) {
			mediaDropTargetId = folderId;
		}
	}

	function handleMediaDragLeave(e: DragEvent, folderId: string): void {
		// Only clear when leaving this row (not when entering a child)
		const related = e.relatedTarget as Node | null;
		const current = e.currentTarget as HTMLElement | null;
		if (current && related && current.contains(related)) return;
		if (mediaDropTargetId === folderId) {
			mediaDropTargetId = null;
		}
	}

	async function handleMediaDrop(e: DragEvent, folderId: string): Promise<void> {
		if (!hasMediaDrag(e.dataTransfer)) return;
		e.preventDefault();
		e.stopPropagation();
		clearMediaDropTarget();

		const payload = getMediaDragPayload(e.dataTransfer);
		if (!payload?.ids.length) {
			toast.error('No media to move');
			return;
		}

		// No-op when dropping into the folder already being viewed
		const currentId = activeFolderId === 'root' ? null : activeFolderId;
		const targetId = folderId === 'root' ? null : folderId;
		if (currentId === targetId) {
			toast.info('Already in this folder');
			return;
		}

		if (isMovingMedia) return;
		isMovingMedia = true;

		try {
			const moved = await moveMediaToFolder(payload.ids, targetId, {
				csrfToken: page.data.csrfToken,
			});
			const folderLabel =
				folderId === 'root'
					? media_root_title()
					: folders.find((f) => f.id === folderId)?.name ?? 'folder';
			toast.success(
				moved.movedCount === 1
					? `Moved 1 item to ${folderLabel}`
					: `Moved ${moved.movedCount} items to ${folderLabel}`,
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Move failed';
			toast.error(message);
			logger.error('[MediaFolders] Media move error:', err);
		} finally {
			isMovingMedia = false;
		}
	}

	function isMediaDropHighlight(folderId: string): boolean {
		return mediaDropTargetId === folderId;
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

{#snippet mediaFolderRow(node: FolderNode, depth: number)}
	{@const hasChildren = (node.children?.length ?? 0) > 0}
	{@const selected = activeFolderId === node.id}
	{@const expanded = folderExpanded.has(node.id)}
	{@const indent = depth * 12}
	{@const dropHighlight = isMediaDropHighlight(node.id)}

	<div class="group/folder relative flex flex-col">
		<div
			role="listitem"
			class="flex w-full items-center gap-1 rounded py-0.5 text-start text-[15px] font-medium leading-none transition-colors
				{dropHighlight ? 'bg-primary-500/20 ring-1 ring-inset ring-primary-500/60' : ''}"
			style="padding-inline-start: {indent}px"
			ondragover={(e) => handleMediaDragOver(e, node.id)}
			ondragleave={(e) => handleMediaDragLeave(e, node.id)}
			ondrop={(e) => handleMediaDrop(e, node.id)}
			data-media-drop-target={node.id}
		>
			{#if hasChildren}
				<Button
						variant="ghost"
						type="button"
						class="flex h-5 w-5 shrink-0 items-center justify-center rounded opacity-60"
						onclick={(e: MouseEvent) => toggleFolderBranch(node, e)}
						aria-label={expanded ? 'Collapse folder' : 'Expand folder'}
						aria-expanded={expanded}
					>
						<iconify-icon
							icon="mdi:chevron-right"
							width="16"
							class="transition-transform duration-200 {expanded ? 'rotate-90' : ''}"
							aria-hidden="true"
						></iconify-icon>
					</Button>
			{:else}
				<span class="w-5 shrink-0" aria-hidden="true"></span>
			{/if}

			<Button
					variant="ghost"
					type="button"
					class="flex min-w-0 flex-1 items-center gap-1.5 rounded-none py-0 text-start
						{selected ? 'text-amber-400 dark:text-amber-300' : 'text-surface-300 dark:text-surface-300'}"
					onclick={() => handleFolderClick(node)}
					aria-selected={selected}
					role="treeitem"
				>
					<iconify-icon
						icon={dropHighlight ? 'mdi:folder-move-outline' : 'mdi:folder-outline'}
						width="18"
						class="shrink-0 {dropHighlight ? 'text-primary-500' : 'text-surface-400'}"
						aria-hidden="true"
					></iconify-icon>
					<span class="truncate">{node.name}</span>
				</Button>

			{#if node.actions?.length}
				<div class="flex shrink-0 items-center opacity-0 transition-opacity group-hover/folder:opacity-100">
					{#each node.actions as action (action.label)}
						<Button
								variant="ghost"
								type="button"
								class="flex h-6 w-6 items-center justify-center rounded {action.colorClass ?? ''}"
								onclick={(e: MouseEvent) => action.onClick(node, e)}
								aria-label={action.label}
								title={action.label}
							>
								<iconify-icon icon={action.icon} width="14"></iconify-icon>
							</Button>
					{/each}
				</div>
			{/if}
		</div>

		{#if hasChildren && expanded}
			{#each node.children ?? [] as child (child.id)}
				{@render mediaFolderRow(child, depth + 1)}
			{/each}
		{/if}
	</div>
{/snippet}

<div class="space-y-1" role="navigation" aria-label="Media folders">
	<!-- Search Header -->
	<div class="flex items-center gap-1">
		<div class="relative w-full min-w-0">
			<Input aria-label="Search folders"
					type="text"
					bind:value={search}
					placeholder="Search folders..."
					inputClass="h-9 w-full min-w-0 rounded border border-surface-300 bg-surface-50 px-2.5 py-1 text-[15px] outline-none transition-all hover:border-surface-400 focus:border-tertiary-500 dark:border-surface-600 dark:bg-surface-800 {isSidebarFull ? 'pe-10' : 'pe-2'}"
				/>
			{#if isSidebarFull && search}
				<div class="absolute inset-e-0 top-0 flex h-full items-center">
					<Button
						variant="outline"
						type="button"
						onclick={() => (search = '')}
						aria-label="Clear search"
						class="me-0.5 h-8 w-8 rounded-full preset-outline-surface-500"
					>
						<iconify-icon icon="ic:round-close" width={24}></iconify-icon>
					</Button>
				</div>
			{:else if isSidebarFull && !search}
				<div class="absolute inset-e-0 top-0 flex h-full items-center">
					<div class="me-0.5 flex h-8 w-8 items-center justify-center rounded-e bg-secondary-100 dark:bg-surface-700">
						<iconify-icon icon="ic:outline-search" width={20}></iconify-icon>
					</div>
				</div>
			{/if}
		</div>
		{#if isSidebarFull}
			<Button
				variant="warning"
				type="button"
				onclick={() => (isEditMode = !isEditMode)}
				aria-pressed={isEditMode}
				aria-label="Toggle Edit Mode"
				title="Edit Folders"
				class="h-9 w-9 min-w-0 shrink-0 p-0!"
			>
				<iconify-icon icon={isEditMode ? 'bi:check-circle' : 'bi:pencil'} width="16"></iconify-icon>
			</Button>
		{/if}
	</div>

	{#if isEditMode && isSidebarFull}
		<div class="flex items-start gap-2 rounded bg-warning-500/10 p-3 text-xs text-warning-700 dark:text-warning-400">
			<iconify-icon icon="bi:info-circle" width={24}></iconify-icon>
			<p>Drag folders to reorder or move. Use node actions for rename/delete.</p>
		</div>
	{/if}

	<!-- Folder tree (Media Root + folders) -->
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
			{#if isSidebarFull}
				{@const rootNode = tree[0]}
				{@const rootHasChildren = (rootNode.children?.length ?? 0) > 0}
				{@const rootSelected = activeFolderId === 'root'}
				{@const rootDropHighlight = isMediaDropHighlight('root')}
				<div class="flex flex-col" role="tree" aria-label="Media folder tree">
					<div class="group/root relative flex flex-col">
						<div
							role="listitem"
							class="rounded transition-colors
								{rootDropHighlight ? 'bg-primary-500/20 ring-1 ring-inset ring-primary-500/60' : ''}"
							ondragover={(e) => handleMediaDragOver(e, 'root')}
							ondragleave={(e) => handleMediaDragLeave(e, 'root')}
							ondrop={(e) => handleMediaDrop(e, 'root')}
							data-media-drop-target="root"
						>
							<Button
								variant="ghost"
								type="button"
								class="flex w-full items-center gap-1.5 rounded-none py-1 text-start text-[15px] font-medium leading-none transition-colors
									{rootSelected ? 'text-amber-400 dark:text-amber-300' : 'text-surface-200 dark:text-surface-200'}"
								onclick={handleRootClick}
								aria-expanded={rootHasChildren ? rootExpanded : undefined}
								aria-selected={rootSelected}
								role="treeitem"
							>
								{#if rootHasChildren}
									<iconify-icon
										icon="mdi:chevron-right"
										width="16"
										class="shrink-0 opacity-60 transition-transform duration-200 {rootExpanded ? 'rotate-90' : ''}"
										aria-hidden="true"
									></iconify-icon>
								{/if}
								<iconify-icon
									icon={rootDropHighlight ? 'mdi:folder-move-outline' : 'mdi:home-outline'}
									width="18"
									class="shrink-0 {rootDropHighlight ? 'text-primary-500' : ''}"
									aria-hidden="true"
								></iconify-icon>
								<span class="truncate">{rootNode.name}</span>
							</Button>
						</div>

						{#if rootHasChildren && rootExpanded}
							<div class="relative">
								<div
									class="pointer-events-none absolute bottom-0 inset-s-5.5 top-0 w-px bg-surface-600/50 dark:bg-white/10"
									aria-hidden="true"
								></div>
								{#each rootNode.children ?? [] as folder (folder.id)}
									{@render mediaFolderRow(folder, 1)}
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{:else}
				<!-- Compact sidebar: wrap TreeView with media drop handlers on a container -->
				<div
					role="region"
					aria-label="Media drop target"
					class="rounded transition-colors
						{mediaDropTargetId ? 'bg-primary-500/10 ring-1 ring-inset ring-primary-500/40' : ''}"
					ondragover={(e) => {
						if (!hasMediaDrag(e.dataTransfer)) return;
						e.preventDefault();
						// Drop on compact tree defaults to the active/hovered folder via data attribute if present
						const el = (e.target as HTMLElement | null)?.closest?.('[data-folder-id]') as HTMLElement | null;
						const id = el?.dataset?.folderId ?? activeFolderId;
						handleMediaDragOver(e, id);
					}}
					ondragleave={(e) => {
						const related = e.relatedTarget as Node | null;
						const current = e.currentTarget as HTMLElement | null;
						if (current && related && current.contains(related)) return;
						clearMediaDropTarget();
					}}
					ondrop={(e) => {
						if (!hasMediaDrag(e.dataTransfer)) return;
						const el = (e.target as HTMLElement | null)?.closest?.('[data-folder-id]') as HTMLElement | null;
						const id = el?.dataset?.folderId ?? mediaDropTargetId ?? activeFolderId;
						handleMediaDrop(e, id);
					}}
				>
					<TreeView
						nodes={tree}
						selectedId={activeFolderId}
						compact={true}
						iconColorClass="text-surface-400 dark:text-surface-500"
						showBadges={false}
						allowDragDrop={isEditMode}
						onReorder={reorder}
					/>
				</div>
			{/if}
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
