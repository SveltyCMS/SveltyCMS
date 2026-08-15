<!--
@file src/components/media-folders.svelte
@component MediaFolders – Virtual folder tree for the media gallery sidebar

Uses the same shared TreeView as collections:
- **Folders** = categories (nestable)
- **Media files** = dropped onto folders (external sveltednd drop)
- HTML5 drag in edit mode = reorder / reparent folders (before | after | inside)

### Features:
- Shared `TreeView` (`variant="media"`) for full + compact sidebar
- Click navigation (closes sidebar on mobile)
- Edit mode: drag & drop reordering / nesting via TreeView
- Accept media drag-and-drop from media-grid (move into virtual folder)
- Spring-open collapsed folders while a media drag hovers
- Persistent loading/error/empty states
- Event-driven refresh on folder changes
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import TreeView from '@components/ui/tree-view.svelte';
	import type { TreeExternalDrop, TreeItem } from '@components/ui/tree-view.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { media_root_title } from '@src/paraglide/messages';
	import { screen } from '@src/stores/screen-size-store.svelte.ts';
	import { ui } from '@src/stores/ui-store.svelte.ts';
	import { mediaFolderTree } from '@src/stores/media-folder-tree.svelte.ts';
	import type { Snippet } from 'svelte';
	import { logger } from '@utils/logger';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { dndState, type DragDropState } from '@thisux/sveltednd';
	import {
		MEDIA_DRAG_CONTAINER,
		MEDIA_DROP_OK,
		MEDIA_DROP_SAME,
		moveMediaToFolder,
		type MediaDragData,
	} from '@utils/media/media-dnd';
	import { untrack } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import { goto } from '$app/navigation';
	import { pinnedStore } from '@src/stores/pinned-store.svelte';
	import { page } from '$app/state';

	interface FolderNode extends TreeItem {
		children?: FolderNode[];
		depth?: number;
		nodeType: 'folder' | 'virtual';
		order: number;
		parentId?: string | null;
		path: string;
		type: 'folder';
	}

	// Mutable UI state (folder data lives in mediaFolderTree)
	let folderExpanded = $state(new SvelteSet<string>(['root']));
	let activeFolderId = $state('root');
	let isEditMode = $state(false);
	let search = $state('');
	let isMovingMedia = $state(false);

	const folders = $derived(mediaFolderTree.folders);
	const isLoading = $derived(mediaFolderTree.isLoading);
	const error = $derived(mediaFolderTree.error);

	/** True only while a media-gallery card (not a folder-reorder drag) is in flight */
	const isMediaDragActive = $derived(
		dndState.isDragging && dndState.sourceContainer === MEDIA_DRAG_CONTAINER,
	);

	let isSidebarFull = $derived(ui.state.leftSidebar === 'full');
	let isMobile = $derived(screen.isMobile);

	function setFolderExpanded(id: string, open: boolean): void {
		// Idempotence guard: the URL-sync $effect below reads folderExpanded
		// (via new SvelteSet(folderExpanded)) and assigns a fresh SvelteSet —
		// without this early return every run creates a new object identity,
		// re-invalidating the effect forever (effect_update_depth_exceeded).
		if (folderExpanded.has(id) === open) return;
		const next = new SvelteSet(folderExpanded);
		if (open) next.add(id);
		else next.delete(id);
		folderExpanded = next;
	}

	// ── Spring-load: hovering a collapsed folder during a media drag opens it ──
	const SPRING_OPEN_MS = 500;
	let springTimer: ReturnType<typeof setTimeout> | null = null;
	let springHoverId: string | null = null;
	let springExpanded = new Set<string>();
	let springDropTarget: string | null = null;

	function clearSpringTimer(): void {
		if (springTimer) {
			clearTimeout(springTimer);
			springTimer = null;
		}
		springHoverId = null;
	}

	function onFolderDragEnter(nodeId: string): void {
		if (!isMediaDragActive || springHoverId === nodeId) return;
		clearSpringTimer();
		// Root is always expandable via TreeView; spring-open nested ids that are collapsed
		if (folderExpanded.has(nodeId)) return;
		const hasChildren =
			nodeId === 'root'
				? folders.some((f) => !f.parentId)
				: folders.some((f) => f.parentId === nodeId);
		if (!hasChildren) return;
		springHoverId = nodeId;
		springTimer = setTimeout(() => {
			springExpanded.add(nodeId);
			setFolderExpanded(nodeId, true);
			springTimer = null;
		}, SPRING_OPEN_MS);
	}

	function onFolderDragLeave(nodeId: string): void {
		if (springHoverId !== nodeId) return;
		clearSpringTimer();
	}

	$effect(() => () => clearSpringTimer());

	$effect(() => {
		if (isMediaDragActive) return;
		untrack(() => {
			clearSpringTimer();
			if (springExpanded.size === 0) return;
			const keep = springDropTarget
				? new Set(mediaFolderTree.pathOf(springDropTarget).map((f) => f.id))
				: new Set<string>();
			const next = new SvelteSet(folderExpanded);
			for (const id of springExpanded) {
				if (!keep.has(id)) next.delete(id);
			}
			folderExpanded = next;
			springExpanded = new Set();
			springDropTarget = null;
		});
	});

	// Sync selection from URL (browser back/forward).
	// Only the *ancestor* chain is force-expanded — expanding the selected node
	// itself here would immediately undo the collapse toggle the user just made
	// in TreeView (clicking a folder both selects it and toggles it).
	$effect(() => {
		activeFolderId = page.url.searchParams.get('folderId') || 'root';
		if (activeFolderId !== 'root') {
			expandAncestorChain(activeFolderId);
		}
		setFolderExpanded('root', true);
	});

	async function loadFolders(): Promise<void> {
		await mediaFolderTree.load();
		if (mediaFolderTree.error) {
			toast.error('Failed to load folders');
		}
	}

	// Build hierarchical tree for TreeView (same shape as collections: folders = categories)
	let tree = $derived.by((): FolderNode[] => {
		const root: FolderNode = {
			id: 'root',
			name: media_root_title(),
			path: '/',
			icon: 'mdi:home-outline',
			nodeType: 'folder',
			type: 'folder',
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
				id: f.id,
				name: f.name,
				path: f.path,
				parentId: f.parentId,
				order: f.order,
				icon: 'mdi:folder-outline',
				nodeType: 'folder',
				type: 'folder',
				children: [],
				depth: 0,
				onClick: () => selectFolder(f.id),
				actions: isSidebarFull
					? [
							{
								icon: isPinned ? 'bi:pin-angle-fill' : 'bi:pin-angle',
								label: isPinned ? 'Unpin Folder' : 'Pin Folder',
								colorClass: isPinned
									? 'text-tertiary-500 dark:text-primary-500'
									: 'text-surface-500',
								onClick: () => {
									pinnedStore.togglePin({
										id: f.id,
										name: f.name,
										type: 'folder',
										path: `/mediagallery?folderId=${f.id}`,
										icon: 'mdi:folder-outline',
									});
								},
							},
						]
					: undefined,
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
				if (n.children?.length) sortAndSetDepth(n.children, depth + 1);
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
		setFolderExpanded('root', true);
	}

	function selectFolder(id: string): void {
		const resolved = id === 'root' ? 'root' : id;
		activeFolderId = resolved;
		if (resolved === 'root') {
			setFolderExpanded('root', true);
		} else {
			// Ancestors only — TreeView already toggled this node's own expanded
			// state on the same click; forcing it open here would make collapse
			// impossible.
			expandAncestorChain(resolved);
		}
		if (isMobile) {
			ui.toggle('leftSidebar', 'hidden');
		}
		const path = resolved === 'root' ? '/mediagallery' : `/mediagallery?folderId=${resolved}`;
		goto(path);
	}

	/** Folder reorder / reparent — mirrors collections TreeView (before | after | inside). */
	async function reorder(
		draggedId: string,
		targetId: string,
		position: 'before' | 'after' | 'inside',
	): Promise<void> {
		if (!isEditMode || draggedId === 'root' || draggedId === targetId) return;

		let newParentId: string | null = null;
		if (position === 'inside') {
			newParentId = targetId === 'root' ? null : targetId;
		} else {
			const target = folders.find((f) => f.id === targetId);
			newParentId = target?.parentId ?? null;
		}

		// Cycle guard
		if (newParentId) {
			let walk: string | null | undefined = newParentId;
			const seen = new Set<string>();
			while (walk) {
				if (walk === draggedId) {
					toast.warning('Cannot move a folder into itself or its descendants.');
					return;
				}
				if (seen.has(walk)) break;
				seen.add(walk);
				walk = folders.find((f) => f.id === walk)?.parentId;
			}
		}

		// Sibling order: place relative to target among same parent
		const siblings = folders
			.filter((f) =>
				newParentId == null
					? !f.parentId && f.id !== draggedId
					: f.parentId === newParentId && f.id !== draggedId,
			)
			.sort((a, b) => a.order - b.order);

		let insertAt = siblings.length;
		if (position !== 'inside') {
			const ti = siblings.findIndex((f) => f.id === targetId);
			insertAt = ti < 0 ? siblings.length : position === 'after' ? ti + 1 : ti;
		}

		const orderUpdates: Array<{ folderId: string; order: number; parentId: string | null }> = [];
		const dragged = folders.find((f) => f.id === draggedId);
		if (!dragged) return;

		const next = [...siblings];
		next.splice(insertAt, 0, { ...dragged, parentId: newParentId });
		next.forEach((f, i) => {
			orderUpdates.push({ folderId: f.id, order: i, parentId: newParentId });
		});

		try {
			const res = await fetch('/api/system-virtual-folder', {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': page.data.csrfToken ?? '',
				},
				body: JSON.stringify({
					action: 'reorder',
					parentId: newParentId,
					orderUpdates,
				}),
			});

			if (!res.ok) throw new Error('Failed');
			toast.success('Folder moved');
			await loadFolders();
		} catch (e) {
			toast.error('Move failed');
			logger.error('[MediaFolders] Reorder error:', e);
		}
	}

	async function handleMediaFolderDrop(
		nodeId: string,
		state: unknown,
	): Promise<void> {
		const drag = state as DragDropState<MediaDragData>;
		const ids = drag.draggedItem?.ids ?? [];
		if (!ids.length) {
			toast.error('No media to move');
			return;
		}

		springDropTarget = nodeId;
		clearSpringTimer();

		const currentId = activeFolderId === 'root' ? null : activeFolderId;
		const targetId = nodeId === 'root' ? null : nodeId;
		if (currentId === targetId) {
			toast.info('Already in this folder');
			return;
		}

		if (isMovingMedia) return;
		isMovingMedia = true;

		try {
			const moved = await moveMediaToFolder(ids, targetId, {
				csrfToken: page.data.csrfToken,
			});
			const folderLabel =
				nodeId === 'root'
					? media_root_title()
					: (folders.find((f) => f.id === nodeId)?.name ?? 'folder');
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

	const externalDrop = $derived.by((): TreeExternalDrop => ({
		enabled: isMediaDragActive,
		okClass: MEDIA_DROP_OK,
		sameClass: MEDIA_DROP_SAME,
		isSameTarget: (nodeId) => activeFolderId === nodeId,
		onDrop: handleMediaFolderDrop,
		onDragEnter: onFolderDragEnter,
		onDragLeave: onFolderDragLeave,
	}));

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

<div class="space-y-1" role="navigation" aria-label="Media folders">
	<!-- Search Header -->
	{#if isSidebarFull}
		<div class="flex items-center gap-1">
			<div class="relative w-full min-w-0">
				{#snippet searchIcon()}
					<iconify-icon icon="ic:outline-search" width="20" class="text-surface-400"></iconify-icon>
				{/snippet}

				{#snippet clearIcon()}
					{#if search}
						<Button
							variant="ghost"
							type="button"
							onclick={() => (search = '')}
							class="p-0.5 min-w-0 rounded-full hover:bg-surface-700"
							aria-label="Clear search"
						>
							<iconify-icon icon="ic:round-close" width="18"></iconify-icon>
						</Button>
					{/if}
				{/snippet}

				<Input
					id="media-folders-search"
					type="search"
					bind:value={search}
					placeholder="Search folders..."
					pre={searchIcon as Snippet}
					post={clearIcon as Snippet}
					inputClass="w-full text-xs"
					aria-label="Search folders"
				/>
			</div>

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
		</div>
	{:else}
		<div class="flex flex-col items-center gap-2">
			<SystemTooltip title="Search Folders" positioning={{ placement: 'right' }}>
				<Button
					variant="ghost"
					type="button"
					onclick={() => ui.toggle('leftSidebar', 'full')}
					aria-label="Search folders"
					class="flex h-9 w-9 items-center justify-center rounded-lg p-0! min-w-0 hover:bg-surface-200 dark:hover:bg-surface-800"
				>
					<iconify-icon icon="ic:outline-search" width="20"></iconify-icon>
				</Button>
			</SystemTooltip>
		</div>
	{/if}

	{#if isEditMode && isSidebarFull}
		<div class="flex items-start gap-2 rounded bg-warning-500/10 p-3 text-xs text-warning-700 dark:text-warning-400">
			<iconify-icon icon="bi:info-circle" width={24}></iconify-icon>
			<p>
				Drag folders to reorder. Drop onto the <strong>middle</strong> of a folder to nest (same as
				collections). Use pin actions for quick access.
			</p>
		</div>
	{/if}

	<div class="media-folders-list">
		{#if isLoading && folders.length === 0}
			<div class="flex flex-col items-center justify-center gap-3 p-6">
				<div class="flex gap-2">
					<div class="h-3 w-3 animate-bounce rounded-full bg-tertiary-500 dark:bg-primary-500"></div>
					<div
						class="h-3 w-3 animate-bounce rounded-full bg-tertiary-500 dark:bg-primary-500 [animation-delay:0.1s]"
					></div>
					<div
						class="h-3 w-3 animate-bounce rounded-full bg-tertiary-500 dark:bg-primary-500 [animation-delay:0.2s]"
					></div>
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
			<!-- Single TreeView for full + compact — same UX as collections -->
			<TreeView
				nodes={tree}
				selectedId={activeFolderId}
				bind:expandedIds={folderExpanded}
				compact={!isSidebarFull}
				variant="media"
				iconColorClass="text-surface-400 dark:text-surface-500"
				showBadges={false}
				allowDragDrop={isEditMode}
				{externalDrop}
				onReorder={reorder}
				ariaLabel="Media virtual folders"
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
