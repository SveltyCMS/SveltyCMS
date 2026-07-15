<!--
@file src/routes/(app)/mediagallery/+page.svelte
@component
**Enhanced Media Gallery Page**

### Features:
- Global hotkeys via src/utils/hotkeys.ts
- Desktop: drag media onto sidebar folders or breadcrumb ancestors
- Mobile: drag/drop onto breadcrumbs (sidebar is too narrow); with a selection,
  tap a parent breadcrumb to move selected items without HTML5 drag
-->

<script lang="ts">
import { onMount } from "svelte";
import { invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import type { PageData } from "./$types";
import MediaGrid from "./media-grid.svelte";
import MediaTable from "./media-table.svelte";
import AdvancedSearchModal from "./advanced-search-modal.svelte";
import Portal from "@components/ui/portal.svelte";
import type { SearchCriteria } from "@utils/media/advanced-search";
import { mediaUrl } from "@utils/media/media-utils";
import ImageEditorModal from "@src/components/image-editor/image-editor-modal.svelte";
import { IMAGE_EDITOR_MODAL_CLASSES, IMAGE_EDITOR_MODAL_SIZE } from "@src/components/image-editor/image-editor-modal.ts";
import ModalPrompt from "@components/modal-prompt.svelte";
import MediaDetailsModal from "@src/components/media/media-details-modal.svelte";
import AdminPageShell from "@components/admin-page-shell.svelte";
import Slot from "@components/system/slot.svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import { logger } from "@utils/logger";
import {
	type MediaBase,
	type MediaImage,
	MediaTypeEnum,
} from "@utils/media/media-models";
import {
	getMediaDragPayload,
	hasMediaDrag,
	moveMediaToFolder,
} from "@utils/media/media-dnd";
import { modalState } from "@utils/modal.svelte";
import { showConfirm } from "@utils/modal.svelte";
import { registerHotkey } from "@src/utils/hotkeys";
import { uploadMediaFiles } from "@utils/media/upload-client";
import { SvelteSet } from "svelte/reactivity";
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';

let { data }: { data: PageData } = $props();

// State
let files = $state<Array<MediaBase | MediaImage>>([]);
let globalSearchValue = $state("");
let selectedMediaType = $state<"All" | MediaTypeEnum>("All");
let view = $state<"grid" | "table">("grid");
let gridSize = $state<"tiny" | "small" | "medium" | "large">("small");
	let selectedFiles = $state(new SvelteSet<string>());
	let isSelectionMode = $state(false);
	let fileUploadInput = $state<HTMLInputElement>();
	let isUploading = $state(false);
	let isBulkDownloading = $state(false);
	let showAdvancedSearch = $state(false);
	let searchCriteria = $state<SearchCriteria | null>(null);
	let sortBy = $state("newest");
	/** Breadcrumb folder key currently highlighted as media drop target (`root` | folderId) */
	let breadcrumbDropKey = $state<string | null>(null);
	let isMovingMedia = $state(false);

const sortOptions = [
	{ value: "newest", label: "Newest first" },
	{ value: "oldest", label: "Oldest first" },
	{ value: "name-asc", label: "Name (A-Z)" },
	{ value: "name-desc", label: "Name (Z-A)" },
	{ value: "size-desc", label: "Size (Largest)" },
	{ value: "size-asc", label: "Size (Smallest)" },
];

// Keep the grid in sync with server data: re-runs whenever `load` re-fetches
// (e.g. after invalidateAll following an upload), so new media appears without
// a full page reload. Local optimistic edits (delete/edit) mutate `files`
// directly and are reconciled on the next invalidation.
$effect(() => {
	files = [...((data?.media ?? []) as unknown as (MediaBase | MediaImage)[])];
});

const mediaTypes = [
	{ value: "All", label: "ALL" },
	{ value: MediaTypeEnum.Image, label: "IMAGE" },
	{ value: MediaTypeEnum.Document, label: "DOCUMENT" },
	{ value: MediaTypeEnum.Audio, label: "AUDIO" },
	{ value: MediaTypeEnum.Video, label: "VIDEO" },
];

const mediaTypeOptions = mediaTypes.map((type) => ({
	value: type.value,
	label: type.label,
}));

// Published media reference gating
const publishedMediaIds = $derived(new SvelteSet<string>((data as { publishedMediaIds?: string[] }).publishedMediaIds ?? []));

// Derived
const filteredFiles = $derived.by(() => {
	let result = files.filter((file) => {
		if (globalSearchValue) {
			const matchesSearch = (file.filename || "").toLowerCase().includes(globalSearchValue.toLowerCase());
			if (!matchesSearch) return false;
		}
		if (selectedMediaType !== "All" && file.type !== selectedMediaType) {
			return false;
		}

		if (searchCriteria) {
			const img = file as MediaImage;
			const meta = file.metadata as Record<string, any> | undefined;

			if (searchCriteria.filename && !file.filename?.toLowerCase().includes(searchCriteria.filename.toLowerCase())) return false;
			if (searchCriteria.minSize && file.size < searchCriteria.minSize) return false;
			if (searchCriteria.maxSize && file.size > searchCriteria.maxSize) return false;
			if (searchCriteria.minWidth && (!img.width || img.width < searchCriteria.minWidth)) return false;
			if (searchCriteria.maxWidth && (!img.width || img.width > searchCriteria.maxWidth)) return false;
			if (searchCriteria.minHeight && (!img.height || img.height < searchCriteria.minHeight)) return false;
			if (searchCriteria.maxHeight && (!img.height || img.height > searchCriteria.maxHeight)) return false;
			if (searchCriteria.uploadedAfter && new Date(file.createdAt || 0) < searchCriteria.uploadedAfter) return false;
			if (searchCriteria.uploadedBefore && new Date(file.createdAt || 0) > searchCriteria.uploadedBefore) return false;
			if (searchCriteria.fileTypes && searchCriteria.fileTypes.length > 0 && !searchCriteria.fileTypes.some(t => file.mimeType?.includes(t))) return false;

			if (searchCriteria.tags && searchCriteria.tags.length > 0) {
				const tags = meta?.tags as string[] | undefined;
				if (!tags || !searchCriteria.tags.some(t => tags.includes(t))) return false;
			}
			if (searchCriteria.camera && (!meta?.exif || (meta.exif as any).camera !== searchCriteria.camera)) return false;
			if (searchCriteria.location && (!meta?.exif || (meta.exif as any).location !== searchCriteria.location)) return false;
			if (searchCriteria.dominantColor && meta?.dominantColor !== searchCriteria.dominantColor) return false;
			if (searchCriteria.hasEXIF !== undefined) {
				const hasExif = !!meta?.exif;
				if (hasExif !== searchCriteria.hasEXIF) return false;
			}
			if (searchCriteria.aspectRatio) {
				if (!img.width || !img.height) return false;
				const ratio = img.width / img.height;
				if (searchCriteria.aspectRatio === 'landscape' && ratio <= 1) return false;
				if (searchCriteria.aspectRatio === 'portrait' && ratio >= 1) return false;
				if (searchCriteria.aspectRatio === 'square' && ratio !== 1) return false;
			}
		}
		return true;
	});

	result.sort((a, b) => {
		switch (sortBy) {
			case 'oldest': return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
			case 'name-asc': return (a.filename || '').localeCompare(b.filename || '');
			case 'name-desc': return (b.filename || '').localeCompare(a.filename || '');
			case 'size-desc': return b.size - a.size;
			case 'size-asc': return a.size - b.size;
			case 'newest':
			default: return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
		}
	});

	return result;
});

// Breadcrumb trail mirroring the sidebar folder path. Each ancestor segment of
// the current folder's path is resolved back to its folder via systemVirtualFolders.
const breadcrumbs = $derived.by(() => {
	const crumbs: Array<{ name: string; folderId: string | null }> = [
		{ name: "Media Gallery", folderId: null },
	];
	const current = data.currentFolder as { path?: string } | null;
	if (current?.path && current.path !== "/") {
		const all = (data.systemVirtualFolders ?? []) as Array<{
			_id: string;
			name: string;
			path: string;
		}>;
		let ancestor = "";
		for (const segment of current.path.split("/").filter(Boolean)) {
			ancestor += `/${segment}`;
			const match = all.find((f) => f.path === ancestor);
			crumbs.push({ name: match?.name ?? segment, folderId: match?._id ?? null });
		}
	}
	return crumbs;
});

const assetStats = $derived.by(() => ({
	total: files.length,
	filtered: filteredFiles.length,
	selected: selectedFiles.size,
}));

const currentFolderId = $derived(
	((data.currentFolder as { _id?: string } | null)?._id as string | undefined) ?? null,
);

/** Key used for drop highlight / compare (`root` for media gallery root) */
function crumbDropKey(folderId: string | null): string {
	return folderId ?? "root";
}

function isCurrentCrumb(folderId: string | null): boolean {
	return (folderId ?? null) === currentFolderId;
}

async function moveIdsToFolder(
	ids: string[],
	targetFolderId: string | null,
	folderLabel: string,
): Promise<void> {
	if (!ids.length || isMovingMedia) return;

	if ((targetFolderId ?? null) === currentFolderId) {
		toast.info("Already in this folder");
		return;
	}

	isMovingMedia = true;
	try {
		const moved = await moveMediaToFolder(ids, targetFolderId, {
			csrfToken: page.data.csrfToken,
		});
		toast.success(
			moved.movedCount === 1
				? `Moved 1 item to ${folderLabel}`
				: `Moved ${moved.movedCount} items to ${folderLabel}`,
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : "Move failed";
		toast.error(message);
		logger.error("[MediaGallery] Breadcrumb move failed", err);
	} finally {
		isMovingMedia = false;
		breadcrumbDropKey = null;
	}
}

function handleBreadcrumbDragOver(e: DragEvent, folderId: string | null): void {
	if (!hasMediaDrag(e.dataTransfer)) return;
	// Current folder is not a useful drop target
	if (isCurrentCrumb(folderId)) return;
	e.preventDefault();
	e.stopPropagation();
	if (e.dataTransfer) e.dataTransfer.dropEffect = "move";
	const key = crumbDropKey(folderId);
	if (breadcrumbDropKey !== key) breadcrumbDropKey = key;
}

function handleBreadcrumbDragLeave(e: DragEvent, folderId: string | null): void {
	const related = e.relatedTarget as Node | null;
	const current = e.currentTarget as HTMLElement | null;
	if (current && related && current.contains(related)) return;
	if (breadcrumbDropKey === crumbDropKey(folderId)) {
		breadcrumbDropKey = null;
	}
}

async function handleBreadcrumbDrop(e: DragEvent, folderId: string | null, label: string): Promise<void> {
	if (!hasMediaDrag(e.dataTransfer)) return;
	e.preventDefault();
	e.stopPropagation();
	breadcrumbDropKey = null;

	if (isCurrentCrumb(folderId)) {
		toast.info("Already in this folder");
		return;
	}

	const payload = getMediaDragPayload(e.dataTransfer);
	if (!payload?.ids.length) {
		toast.error("No media to move");
		return;
	}
	await moveIdsToFolder(payload.ids, folderId, label);
}

/**
 * Mobile / touch: with a multi-selection active, tapping an ancestor breadcrumb
 * moves the selection there (HTML5 drag is unreliable on touch devices).
 * Without a selection, navigation proceeds as normal.
 */
function handleBreadcrumbActivate(
	e: MouseEvent,
	folderId: string | null,
	label: string,
	isLast: boolean,
): void {
	if (isLast || isCurrentCrumb(folderId)) return;
	if (selectedFiles.size === 0) return; // let the link navigate

	e.preventDefault();
	e.stopPropagation();
	void moveIdsToFolder([...selectedFiles], folderId, label);
}

onMount(() => {
	// Register Keyboard Shortcuts
	registerHotkey("mod+f", () => document.getElementById("media-gallery-search")?.focus(), "Focus Search");
	registerHotkey(
		"mod+a",
		() => {
			if (isSelectionMode) {
				filteredFiles.forEach((f) => selectedFiles.add(f._id as string));
			} else {
				isSelectionMode = true;
				filteredFiles.forEach((f) => selectedFiles.add(f._id as string));
			}
		},
		"Select All",
	);
	registerHotkey(
		"escape",
		() => {
			if (selectedFiles.size > 0) selectedFiles.clear();
			else if (globalSearchValue) globalSearchValue = "";
			else if (isSelectionMode) isSelectionMode = false;
		},
		"Clear Selection/Search",
		false,
	);
	registerHotkey(
		"delete",
		() => {
			if (selectedFiles.size > 0) {
				const filesToDelete = files.filter((f) =>
					selectedFiles.has(f._id as string),
				);
				handleBulkDelete(filesToDelete);
			}
		},
		"Delete Selected",
	);

	// Wire the grid's empty-state "Upload First File" button, which dispatches
	// an `externalUpload` event with the chosen files.
	const onExternalUpload = (e: Event) => {
		const detail = (e as CustomEvent<{ files: FileList }>).detail;
		if (detail?.files) uploadFiles(detail.files);
	};

	// Sidebar folder drop → optimistic remove from current view, then revalidate
	const onMediaMoved = (e: Event) => {
		const detail = (e as CustomEvent<{ ids: string[]; targetFolderId: string | null }>).detail;
		if (!detail?.ids?.length) return;

		const moved = new Set(detail.ids.map(String));
		// Optimistically drop moved items from the current folder listing
		files = files.filter((f) => !moved.has(String(f._id ?? f.filename)));
		for (const id of moved) {
			selectedFiles.delete(id);
		}
		// Reconcile with server (folder membership, counts, etc.)
		void invalidateAll();
	};

	document.addEventListener("externalUpload", onExternalUpload);
	document.addEventListener("mediaMoved", onMediaMoved);
	return () => {
		document.removeEventListener("externalUpload", onExternalUpload);
		document.removeEventListener("mediaMoved", onMediaMoved);
	};
});

async function handleEditImage(file: any) {
	// Prefer SSR-normalized relative url (same source as grid thumbnails)
	const fullUrl = file.url || mediaUrl(file);
	if (!fullUrl) {
		toast.error("Invalid image URL");
		return;
	}

	modalState.trigger(ImageEditorModal as any, {
		image: { ...file, url: fullUrl },
		onsave: handleEditorSave,
		size: IMAGE_EDITOR_MODAL_SIZE,
		modalClasses: IMAGE_EDITOR_MODAL_CLASSES,
	});
}

async function handleEditorSave(detail: any) {
	try {
		const { mediaId, manipulations } = detail;
		if (!mediaId) {
			toast.error("Media ID missing");
			return;
		}

		// --- SERVER-SIDE BAKING ---
		// Refresh CSRF token (rotates after each mutation) then POST.
		await invalidateAll();
		const response = await fetch(`/api/media/manipulate/${mediaId}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				"X-CSRF-Token": page.data.csrfToken ?? "",
			},
			body: JSON.stringify({ manipulations }),
		});

		if (response.ok) {
			await response.json();
			toast.success("Image processed and saved");

			await invalidateAll();
		} else {
			const error = await response.json();
			toast.error(`Save failed: ${error.message || "Unknown error"}`);
		}
	} catch (err) {
		logger.error("Editor save failed", err);
		toast.error("An unexpected error occurred during save");
	}
}

async function handleBulkDelete(filesToDelete: (MediaBase | MediaImage)[]) {
	showConfirm({
		title: `Delete ${filesToDelete.length} files?`,
		body: "This action cannot be undone.",
		onConfirm: async () => {
			for (const file of filesToDelete) {
				const formData = new FormData();
				formData.append("imageData", JSON.stringify(file));
				await fetch("?/deleteMedia", { method: "POST", body: formData });
			}
			files = files.filter((f) => !selectedFiles.has(f._id as string));
			selectedFiles.clear();
			toast.success("Batch delete complete");
		},
	});
}

// Shared upload path for both the toolbar button and the grid's empty-state.
// Re-syncs the gallery via invalidateAll() (no full page reload) so new media
// fades in within the current folder context.
async function uploadFiles(fileList: FileList | File[]) {
	const list = Array.from(fileList ?? []);
	if (!list.length || isUploading) return;

	isUploading = true;
	try {
		const result = await uploadMediaFiles(list, {
			formActionUrl: "?/upload",
			folder: data.currentFolder?._id || "global",
		});
		if (result.success) {
			toast.success("Media uploaded successfully");
			await invalidateAll();
		} else {
			toast.error(result.message || "Upload failed");
		}
	} catch (err) {
		logger.error("Upload failed", err);
		toast.error("Upload failed");
	} finally {
		isUploading = false;
	}
}

async function handleBulkDownload() {
	if (selectedFiles.size === 0 || isBulkDownloading) return;

	isBulkDownloading = true;
	try {
		const params = new URLSearchParams();
		for (const id of selectedFiles) {
			params.append("id", id);
		}

		const response = await fetch(`/api/media/bulk-download?${params}`);
		if (!response.ok) {
			const err = await response.json().catch(() => ({}));
			toast.error((err as { message?: string }).message || "Bulk download failed");
			return;
		}

		const blob = await response.blob();
		const disposition = response.headers.get("Content-Disposition");
		let filename = `media-bulk-${Date.now()}.tar.gz`;
		const match = disposition?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
		if (match?.[1]) {
			filename = match[1].replace(/['"]/g, "");
		}

		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = filename;
		anchor.click();
		URL.revokeObjectURL(url);
		toast.success("Archive download started");
	} catch (err) {
		logger.error("Bulk download failed", err);
		toast.error("Bulk download failed");
	} finally {
		isBulkDownloading = false;
	}
}

async function handleUpload(e: Event) {
	const input = e.target as HTMLInputElement;
	await uploadFiles(input.files ?? []);
	// Reset so selecting the same file again still fires `change`.
	input.value = "";
}

async function handleCreateFolder() {
	modalState.trigger(
		ModalPrompt as any,
		{
			title: "Create New Folder",
			body: "Enter a name for the new folder:",
			value: "",
			type: "text",
		},
		async (name: string | null) => {
			if (!name?.trim()) return;

			try {
				// The CSRF token is single-use and rotates on every successful
				// mutation, so the cached page.data.csrfToken may be stale.
				// Refresh it right before posting to guarantee a valid token.
				await invalidateAll();
				const response = await fetch("/api/system-virtual-folder", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"X-CSRF-Token": page.data.csrfToken ?? "",
					},
					body: JSON.stringify({
						name: name.trim(),
						parent: data.currentFolder?._id,
					}),
				});
				if (response.ok) {
					toast.success("Folder created");
					// Refresh the sidebar folder tree and re-fetch gallery data
					// without a full page reload.
					document.dispatchEvent(new CustomEvent("folderCreated"));
					await invalidateAll();
				} else {
					const result = await response.json().catch(() => null);
					toast.error(result?.error?.message || result?.message || "Folder creation failed");
				}
			} catch (err) {
				logger.error("Folder creation failed", err);
				toast.error("Folder creation failed");
			}
		},
	);
}

async function handleOpenFileDetails(file: any) {
	modalState.trigger(MediaDetailsModal as any, {
		file,
		size: 'xl',
		dialogClass: 'max-md:p-0',
		contentClass: 'max-md:overflow-hidden max-md:p-0',
		modalClasses:
			'w-full max-w-4xl max-md:max-w-none max-md:max-h-[100dvh] max-md:rounded-none max-md:border-0 max-md:shadow-none',
		onUpdate: (updatedFile: any) => {
			const index = files.findIndex((f) => f._id === updatedFile._id);
			if (index !== -1) {
				files[index] = updatedFile;
			}
		},
		onEdit: (f: MediaImage) => {
			modalState.close();
			handleEditImage(f);
		},
		onDelete: (f: MediaBase | MediaImage) => {
			modalState.close();
			handleDeleteImage(f);
		},
	});
}

function handleUpdateImage(updatedFile: MediaImage) {
  if (!updatedFile?._id) return;
	const index = files.findIndex((f) => f._id === updatedFile._id);
	if (index !== -1) {
		files[index] = updatedFile;
	}
}

async function handleDeleteImage(file: MediaBase | MediaImage) {
	showConfirm({
		title: `Delete "${file.filename}"?`,
		body: "This action cannot be undone.",
		onConfirm: async () => {
			const formData = new FormData();
			formData.append("imageData", JSON.stringify(file));
			const response = await fetch("?/deleteMedia", { method: "POST", body: formData });
			if (response.ok) {
				files = files.filter((f) => f._id !== file._id);
				toast.success("File deleted");
			} else {
				toast.error("Delete failed");
			}
		},
	});
}
</script>

<AdminPageShell
	title="Media Gallery"
	icon="bi:images"
	highlight="Gallery"
	showBackButton={true}
	backUrl="/"
	fullHeight={true}
	titleCompact={true}
	spaceY="4"
>
	{#snippet actions()}
		<div class="flex items-center gap-1 sm:gap-1.5">
			<Button
				variant="surface"
				size="sm"
				onclick={handleCreateFolder}
				aria-label="Create new virtual folder"
				class="h-9 gap-1.5 px-2 text-surface-600 sm:px-3 dark:text-surface-300"
			>
				<iconify-icon icon="mdi:folder-plus" width="18"></iconify-icon>
				<span class="hidden sm:inline">New Folder</span>
			</Button>

			<span class="hidden h-4 w-px bg-surface-300 sm:block dark:bg-surface-700" aria-hidden="true"></span>

			<Button
				size="sm"
				color="var(--color-primary-500)"
				onclick={() => fileUploadInput?.click()}
				disabled={isUploading}
				aria-busy={isUploading}
				class="h-9 gap-1.5 px-2 sm:px-3"
			>
				<iconify-icon icon={isUploading ? "mdi:loading" : "mdi:upload"} width="18" class={isUploading ? "animate-spin" : ""}></iconify-icon>
				<span class="hidden sm:inline">{isUploading ? "Uploading…" : "Upload"}</span>
			</Button>

			<input aria-label="Search media"
				type="file"
				multiple
				class="hidden"
				bind:this={fileUploadInput}
				onchange={handleUpload}
				accept="image/*,video/*,audio/*,application/pdf"
				data-testid="media-upload-input"
			/>
		</div>
	{/snippet}

	<div class="flex min-h-0 flex-1 flex-col gap-0">
		{#if assetStats.selected > 0}
			<div class="shrink-0 px-2 sm:px-3">
				<div
					class="flex flex-wrap items-center justify-between gap-2 border-b border-primary-500/30 py-2"
					role="status"
					aria-live="polite"
				>
					<p class="text-xs text-surface-600 dark:text-surface-300">
						<span class="font-medium text-surface-800 dark:text-surface-100">{assetStats.selected} selected</span>
						<span class="hidden text-surface-500 sm:inline dark:text-surface-400"> · Del to remove · Esc to clear</span>
					</p>
					<Button
						variant="surface"
						size="sm"
						onclick={handleBulkDownload}
						disabled={isBulkDownloading}
						aria-busy={isBulkDownloading}
						aria-label="Download selected files as archive"
						class="h-8 gap-1.5 px-3"
					>
						<iconify-icon
							icon={isBulkDownloading ? "mdi:loading" : "mdi:archive-arrow-down-outline"}
							width="16"
							class={isBulkDownloading ? "animate-spin" : ""}
						></iconify-icon>
						<span>{isBulkDownloading ? "Preparing…" : "Download Archive"}</span>
					</Button>
				</div>
			</div>
		{/if}

		<!-- Toolbar -->
		<div class="shrink-0 px-2 sm:px-3" data-testid="media-gallery-toolbar">
			<div
				class="flex flex-col gap-2.5 py-3 sm:flex-row sm:items-center sm:gap-3"
			>
			<div class="relative min-w-0 w-full sm:flex-1">
				<iconify-icon icon="mdi:magnify" class="pointer-events-none absolute inset-s-3 top-1/2 z-10 -translate-y-1/2 opacity-50" width="18"></iconify-icon>
				<Input
					id="media-gallery-search"
					bind:value={globalSearchValue}
					type="search"
					placeholder="Search media... (Mod+F)"
					class="w-full ps-9 dark:border-surface-700/60 focus-visible:ring-1"
					aria-label="Search media assets"
				/>
			</div>

			<div class="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">
				{#if view === 'grid'}
					<label for="media-type-filter" class="sr-only">Filter by media type</label>
					<Select
						id="media-type-filter"
						bind:value={selectedMediaType}
						options={mediaTypeOptions}
						placeholder="Type"
						class="w-full sm:w-28"
					/>
				{/if}

				<label for="sort-by-filter" class="sr-only">Sort by</label>
				<Select
					id="sort-by-filter"
					bind:value={sortBy}
					options={sortOptions}
					placeholder="Sort"
					class="w-full sm:w-36"
				/>

				<Button
					variant={searchCriteria ? 'tertiary' : 'ghost'}
					size="sm"
					onclick={() => showAdvancedSearch = true}
					aria-label="Advanced Search"
					class="h-10 text-sm {searchCriteria ? 'preset-filled-tertiary-500 text-white' : ''}"
				>
					<iconify-icon icon="mdi:filter-variant" width="18"></iconify-icon>
					<span class="hidden sm:inline">{searchCriteria ? 'Filtered' : 'Filter'}</span>
				</Button>

				<div class="flex h-10 items-center gap-0.5" role="group" aria-label="View mode">
					<Button
						variant="ghost"
						size="sm"
						onclick={() => (view = 'grid')}
						class="h-10 w-10 min-w-0 p-0! {view === 'grid'
							? 'border-b-2 border-primary-500 text-surface-800 dark:text-surface-100'
							: 'text-surface-500 dark:text-surface-400'}"
						aria-label="Grid view"
						aria-pressed={view === 'grid'}
					>
						<iconify-icon icon="mdi:grid-large" width="16"></iconify-icon>
					</Button>
					<Button
						variant="ghost"
						size="sm"
						onclick={() => (view = 'table')}
						class="h-10 w-10 min-w-0 p-0! {view === 'table'
							? 'border-b-2 border-primary-500 text-surface-800 dark:text-surface-100'
							: 'text-surface-500 dark:text-surface-400'}"
						aria-label="Table view"
						aria-pressed={view === 'table'}
					>
						<iconify-icon icon="mdi:format-list-bulleted" width="16"></iconify-icon>
					</Button>
				</div>

				{#if view === 'grid'}
					<Button
						variant={isSelectionMode ? 'surface' : 'ghost'}
						color={isSelectionMode ? 'var(--color-primary-500)' : undefined}
						onclick={() => (isSelectionMode = !isSelectionMode)}
						aria-label="Toggle selection mode"
						aria-pressed={isSelectionMode}
						class="h-10 text-sm"
					>
						<span class="sm:hidden">{isSelectionMode ? 'Done' : 'Select'}</span>
						<span class="hidden sm:inline">{isSelectionMode ? 'Exit Selection' : 'Select'}</span>
					</Button>
				{/if}
			</div>
			</div>
		</div>

		<!--
			Breadcrumbs are first-class drop targets (same move API as the sidebar tree).
			Desktop: drop groups on a sidebar folder OR any ancestor crumb — identical result.
			Mobile: sidebar is tight, so crumbs are the main drop/tap path for parents.
		-->
		{#if breadcrumbs.length > 1}
			<div class="shrink-0 px-2 sm:px-3" data-testid="media-gallery-breadcrumbs">
				<nav
					class="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-surface-200 py-1.5 text-base text-surface-500 sm:gap-2.5 sm:py-2.5 dark:border-surface-800 dark:text-surface-400"
					aria-label="Folder path — drop media on a parent to move (same as sidebar folders)"
				>
					{#each breadcrumbs as crumb, i (crumb.folderId ?? 'root')}
						{@const isLast = i === breadcrumbs.length - 1}
						{@const dropKey = crumbDropKey(crumb.folderId)}
						{@const isDropTarget = !isLast && breadcrumbDropKey === dropKey}
						{@const canReceiveMove = !isLast}

						{#if i > 0}
							<iconify-icon
								icon="mdi:chevron-right"
								width="16"
								class="shrink-0 text-surface-400 dark:text-surface-500"
								aria-hidden="true"
							></iconify-icon>
						{/if}

						{#if isLast}
							<span
								class="max-w-48 shrink-0 truncate rounded-md px-2 py-2 font-medium text-surface-800 sm:max-w-[16rem] sm:px-1 sm:py-0 dark:text-surface-100"
								aria-current="page"
							>{crumb.name}</span>
						{:else}
							<a
								href={crumb.folderId ? `/mediagallery?folderId=${crumb.folderId}` : '/mediagallery'}
								class="inline-flex max-w-48 shrink-0 items-center gap-1 truncate rounded-md px-2 py-2 text-sm font-medium transition-colors sm:max-w-[16rem] sm:px-1.5 sm:py-1 sm:text-base
									{isDropTarget
										? 'bg-primary-500/20 text-primary-600 ring-1 ring-inset ring-primary-500/70 dark:text-primary-400'
										: selectedFiles.size > 0
											? 'bg-surface-100 text-surface-800 hover:bg-primary-500/15 hover:text-primary-600 dark:bg-surface-800 dark:text-surface-100 dark:hover:text-primary-400'
											: 'hover:text-primary-500'}"
								data-preload="hover"
								data-media-drop-target={dropKey}
								aria-label={selectedFiles.size > 0
									? `Move ${selectedFiles.size} selected to ${crumb.name}`
									: `Open folder ${crumb.name}`}
								title={selectedFiles.size > 0
									? `Move selection to ${crumb.name}`
									: canReceiveMove
										? `Drop media here (or open) — same as sidebar`
										: crumb.name}
								ondragover={(e) => handleBreadcrumbDragOver(e, crumb.folderId)}
								ondragleave={(e) => handleBreadcrumbDragLeave(e, crumb.folderId)}
								ondrop={(e) => handleBreadcrumbDrop(e, crumb.folderId, crumb.name)}
								onclick={(e) => handleBreadcrumbActivate(e, crumb.folderId, crumb.name, isLast)}
							>
								{#if isDropTarget || selectedFiles.size > 0}
									<iconify-icon
										icon={isDropTarget ? 'mdi:folder-move-outline' : 'mdi:folder-outline'}
										width="16"
										class="shrink-0 {isDropTarget ? 'text-primary-500' : 'opacity-70'}"
										aria-hidden="true"
									></iconify-icon>
								{/if}
								<span class="truncate">{crumb.name}</span>
							</a>
						{/if}
					{/each}
				</nav>

				{#if selectedFiles.size > 0}
					<p
						class="pb-2 text-[11px] leading-tight text-surface-500 dark:text-surface-400"
						role="status"
					>
						<span class="sm:hidden">
							Tap a parent folder above, or drop onto it, to move {selectedFiles.size}
							{selectedFiles.size === 1 ? 'item' : 'items'}
						</span>
						<span class="hidden sm:inline">
							Drop {selectedFiles.size}
							{selectedFiles.size === 1 ? 'item' : 'items'} on a sidebar folder or breadcrumb parent to move
						</span>
					</p>
				{/if}
			</div>
		{:else if selectedFiles.size > 0}
			<!-- At media root: only sidebar folders are valid destinations for a group move -->
			<div class="shrink-0 px-2 sm:px-3" data-testid="media-gallery-move-hint">
				<p class="border-b border-surface-200 py-2 text-[11px] leading-tight text-surface-500 dark:border-surface-800 dark:text-surface-400" role="status">
					Drop {selectedFiles.size}
					{selectedFiles.size === 1 ? 'item' : 'items'} on a folder in the sidebar to move
				</p>
			</div>
		{/if}

		<!-- Content -->
		<div class="relative flex min-h-0 flex-1 flex-col" data-testid="media-gallery-content">
			{#if view === 'grid'}
				<MediaGrid
					filteredFiles={filteredFiles}
					{gridSize}
					{isSelectionMode}
					bind:selectedFiles={selectedFiles}
					publishedMediaIds={publishedMediaIds}
					onEditImage={handleEditImage}
					onOpenFileDetails={handleOpenFileDetails}
					ondeleteImage={handleDeleteImage}
					onUpdateImage={handleUpdateImage}
				/>
			{:else}
				<MediaTable
					filteredFiles={filteredFiles}
					{isSelectionMode}
					bind:selectedFiles={selectedFiles}
					publishedMediaIds={publishedMediaIds}
					onEditImage={handleEditImage}
					onOpenFileDetails={handleOpenFileDetails}
					ondeleteImage={handleDeleteImage}
					onUpdateImage={handleUpdateImage}
				/>
			{/if}
		</div>
	</div>

	<Slot name="media_gallery" />

	{#if showAdvancedSearch}
		<Portal>
			<div class="fixed inset-0 z-100 bg-surface-900/50 backdrop-blur-sm transition-all" aria-hidden="true"></div>
			<div class="fixed inset-0 z-101 flex items-center justify-center p-4">
				<AdvancedSearchModal
					files={files}
					onSearch={(criteria) => {
						searchCriteria = criteria;
						showAdvancedSearch = false;
					}}
					onClose={() => {
						showAdvancedSearch = false;
					}}
				/>
			</div>
		</Portal>
	{/if}
</AdminPageShell>
