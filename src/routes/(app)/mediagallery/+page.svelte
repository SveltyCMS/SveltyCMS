<!--
@file src/routes/(app)/mediagallery/+page.svelte
@component
**Enhanced Media Gallery Page**

### Features:
- Global hotkeys via src/utils/hotkeys.ts
- Drag media onto sidebar folders or breadcrumbs (same targets everywhere)
- Mobile: the sidebar drawer opens itself on drag and closes when the drag
  ends; tapping a breadcrumb also moves a selection without dragging
-->

<script lang="ts">
import { onMount } from "svelte";
import { slide } from "svelte/transition";
import { refreshAll } from "$app/navigation";
import { page } from "$app/state";
import type { PageData } from "./$types";
import MediaGrid from "./media-grid.svelte";
import MediaTable from "./media-table.svelte";
import MediaDragPreview from "./media-drag-preview.svelte";
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
	type StoredMediaBase,
	MediaTypeEnum,
} from "@utils/media/media-models";
import { droppable, dndState, type DragDropState } from "@thisux/sveltednd";
import {
	MEDIA_DRAG_CONTAINER,
	MEDIA_DROP_OK,
	MEDIA_DROP_SAME,
	moveMediaToFolder,
	type MediaDragData,
} from "@utils/media/media-dnd";
import { useMediaDragSidebar } from "@utils/media/media-drag-sidebar.svelte.ts";
import { modalState } from "@utils/modal.svelte";
import { showConfirm } from "@utils/modal.svelte";
import { registerHotkey } from "@src/utils/hotkeys";
import { uploadMediaFilesHandle } from "@utils/media/upload-client";
import { matchesJsonPathFilter } from "@utils/json-path-filter";
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
	let uploadProgress = $state(0);
	let uploadFileLabel = $state("");
	let uploadCancel: (() => void) | null = $state(null);
	let isBulkDownloading = $state(false);
	let showAdvancedSearch = $state(false);
	let searchCriteria = $state<SearchCriteria | null>(null);
	// Seed from server ?jsonPath= for shareable filtered views
	// svelte-ignore state_referenced_locally — data is from $props(), initial seed only
	let jsonPathFilter = $state((data as { jsonPathFilter?: string }).jsonPathFilter ?? "");
	let sortBy = $state("newest");
	let mobileFiltersExpanded = $state(false);
	/** True only while a media-gallery card (not some unrelated drag) is in flight */
	const isMediaDragActive = $derived(
		dndState.isDragging && dndState.sourceContainer === MEDIA_DRAG_CONTAINER
	);
	/** Breadcrumbs accept drops on every viewport — mobile drags the same way */
	const breadcrumbDropEnabled = $derived(isMediaDragActive);
	let isMovingMedia = $state(false);

	// Mobile: surface the sidebar folder tree for the duration of the drag.
	useMediaDragSidebar(() => isMediaDragActive);

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
			if (searchCriteria.minSize && (file as StoredMediaBase).size < searchCriteria.minSize) return false;
			if (searchCriteria.maxSize && (file as StoredMediaBase).size > searchCriteria.maxSize) return false;
			if (searchCriteria.minWidth && (!img.width || img.width < searchCriteria.minWidth)) return false;
			if (searchCriteria.maxWidth && (!img.width || img.width > searchCriteria.maxWidth)) return false;
			if (searchCriteria.minHeight && (!img.height || img.height < searchCriteria.minHeight)) return false;
			if (searchCriteria.maxHeight && (!img.height || img.height > searchCriteria.maxHeight)) return false;
			if (searchCriteria.uploadedAfter && new Date(file.createdAt || 0) < searchCriteria.uploadedAfter) return false;
			if (searchCriteria.uploadedBefore && new Date(file.createdAt || 0) > searchCriteria.uploadedBefore) return false;
			if (searchCriteria.fileTypes && searchCriteria.fileTypes.length > 0 && !searchCriteria.fileTypes.some(t => (file as any).mimeType?.includes(t))) return false;

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

		// JSON path filter: `metadata.camera = Canon` · multi AND via `;`
		// Applied independently of advanced search so ?jsonPath= / live input always work.
		if (jsonPathFilter.trim() && !matchesJsonPathFilter(file, jsonPathFilter)) {
			return false;
		}

		return true;
	});

	result.sort((a, b) => {
		switch (sortBy) {
			case 'oldest': return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
			case 'name-asc': return (a.filename || '').localeCompare(b.filename || '');
			case 'name-desc': return (b.filename || '').localeCompare(a.filename || '');
			case 'size-desc': return (b as StoredMediaBase).size - (a as StoredMediaBase).size;
			case 'size-asc': return (a as StoredMediaBase).size - (b as StoredMediaBase).size;
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
	}
}

async function handleBreadcrumbDrop(
	state: DragDropState<MediaDragData>,
	folderId: string | null,
	label: string,
): Promise<void> {
	if (isCurrentCrumb(folderId)) {
		toast.info("Already in this folder");
		return;
	}
	const ids = state.draggedItem?.ids ?? [];
	if (!ids.length) {
		toast.error("No media to move");
		return;
	}
	await moveIdsToFolder(ids, folderId, label);
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
		void refreshAll();
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

			await refreshAll();
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
		uploadProgress = 0;
		uploadFileLabel = list.length > 1 ? `0/${list.length}` : list[0]?.name || "";
		const controller = new AbortController();
		const handle = uploadMediaFilesHandle(list, {
			formActionUrl: "?/upload",
			folder: data.currentFolder?._id || "global",
			// Sequential multi-file for accurate per-file progress labels
			sequential: list.length > 1,
			onProgress: (percent) => {
				uploadProgress = percent;
			},
			onFileProgress: (fp) => {
				uploadProgress = fp.overallPercent;
				uploadFileLabel =
					list.length > 1
						? `${fp.fileIndex + 1}/${fp.fileCount}: ${fp.fileName}`
						: fp.fileName;
			},
			signal: controller.signal,
		});
		uploadCancel = () => {
			controller.abort();
			handle.cancel();
		};
		try {
			const result = await handle.promise;
			if (result.aborted) {
				toast.info("Upload cancelled");
			} else if (result.success) {
				const n = result.files?.length || list.length;
				toast.success(n > 1 ? `${n} files uploaded successfully` : "Media uploaded successfully");
				await refreshAll();
			} else {
				toast.error(result.message || "Upload failed");
			}
		} catch (err) {
			logger.error("Upload failed", err);
			toast.error("Upload failed");
		} finally {
			isUploading = false;
			uploadCancel = null;
			uploadProgress = 0;
			uploadFileLabel = "";
		}
	}

	function cancelUpload() {
		uploadCancel?.();
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
			size: "md",
			contentClass: "min-w-80 sm:min-w-sm",
		},
		async (name: string | null) => {
			if (!name?.trim()) return;

			try {
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
					document.dispatchEvent(new CustomEvent("folderCreated"));
					await refreshAll();
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
				data-testid="media-create-folder"
				class="h-9 gap-1.5 px-2 sm:px-3"
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
				<span class="hidden sm:inline">{isUploading ? `Uploading…` : "Upload"}</span>
			</Button>

			<input aria-label="Upload media files"
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

	{#if isUploading}
		<div class="shrink-0 px-2 pb-1 sm:px-3">
			<div
				class="flex items-center gap-3 rounded border border-surface-300 bg-surface-50 p-2 text-xs dark:border-surface-700 dark:bg-surface-800"
				role="progressbar"
				aria-label="Upload progress"
				aria-valuenow={uploadProgress}
				aria-valuemin={0}
				aria-valuemax={100}
			>
				<iconify-icon icon="mdi:upload" width="16" class="shrink-0 text-primary-500"></iconify-icon>
				<div class="h-2 flex-1 overflow-hidden rounded-full bg-surface-300 dark:bg-surface-600">
					<div
						class="h-full rounded-full bg-primary-500 transition-all duration-300"
						style="width: {uploadProgress}%"
					></div>
				</div>
				{#if uploadFileLabel}
					<span class="hidden max-w-40 truncate text-surface-500 sm:inline dark:text-surface-400" title={uploadFileLabel}>
						{uploadFileLabel}
					</span>
				{/if}
				<span class="shrink-0 font-medium tabular-nums text-surface-600 dark:text-surface-300">{uploadProgress}%</span>
				<Button
					variant="outline"
					size="sm"
					type="button"
					onclick={cancelUpload}
					aria-label="Cancel upload"
					class="shrink-0"
				>
					Cancel
				</Button>
			</div>
		</div>
	{/if}

	<div class="flex min-h-0 flex-1 flex-col gap-0">
		{#if assetStats.selected > 0}
			<div class="shrink-0 px-2 sm:px-3">
				<div
					class="flex flex-wrap items-center justify-between gap-2 border-b border-primary-500/30 py-2"
					role="status"
					aria-live="polite"
					data-testid="media-bulk-bar"
				>
					<p class="text-xs text-surface-600 dark:text-surface-300">
						<span class="font-medium text-surface-800 dark:text-surface-100" data-testid="media-bulk-count">{assetStats.selected} selected</span>
						<span class="hidden text-surface-500 sm:inline dark:text-surface-400"> · Del to remove · Esc to clear</span>
					</p>
					<Button
						variant="surface"
						size="sm"
						onclick={handleBulkDownload}
						disabled={isBulkDownloading}
						aria-busy={isBulkDownloading}
						aria-label="Download selected files as archive"
						data-testid="media-bulk-download"
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

		<!--
			Breadcrumbs — always rendered, including at Media Root where the trail is a
			single crumb, so the path strip never collapses to empty space.

			Every crumb is a drop target on every viewport, mirroring the sidebar tree:
			an ancestor takes the media (primary ring), the current folder rejects it
			(error ring) rather than being inert, so the gesture always gets feedback.
		-->
		<div class="shrink-0 px-2 sm:px-3" data-testid="media-gallery-breadcrumbs">
			<nav
				class="flex min-w-0 items-center gap-1 overflow-x-auto border-b border-surface-200 py-1.5 text-base text-surface-500 sm:gap-2.5 sm:py-2.5 dark:border-surface-800 dark:text-surface-400"
				aria-label="Folder path — drop media on a parent to move (same as sidebar folders)"
			>
				{#each breadcrumbs as crumb, i (crumb.folderId ?? 'root')}
					{@const isLast = i === breadcrumbs.length - 1}
					{@const dropKey = crumbDropKey(crumb.folderId)}
					{@const sameFolder = isCurrentCrumb(crumb.folderId)}
					{@const isDropTarget = breadcrumbDropEnabled && dndState.targetContainer === dropKey}
					{@const dropOptions = {
						container: dropKey,
						disabled: !breadcrumbDropEnabled,
						attributes: { dragOverClass: sameFolder ? MEDIA_DROP_SAME : MEDIA_DROP_OK },
						callbacks: { onDrop: (state: DragDropState<MediaDragData>) => handleBreadcrumbDrop(state, crumb.folderId, crumb.name) },
					}}

					{#if i > 0}
						<iconify-icon
							icon="mdi:chevron-right"
							width="16"
							class="shrink-0 text-surface-400 dark:text-surface-500"
							aria-hidden="true"
						></iconify-icon>
					{/if}

					{#if isLast}
						<!-- Current folder: not a link, but still a droppable so the drag is
							 told "already here" with the same error ring the sidebar uses. -->
						<span
							class="inline-flex max-w-48 shrink-0 items-center gap-1 truncate rounded-md px-2 py-2 font-medium text-surface-800 sm:max-w-[16rem] sm:px-1.5 sm:py-1 dark:text-surface-100"
							aria-current="page"
							data-media-drop-target={dropKey}
							data-testid={`media-breadcrumb-${dropKey}`}
							title={sameFolder && breadcrumbDropEnabled ? 'Already in this folder' : crumb.name}
							use:droppable={dropOptions}
						>
							{#if isDropTarget}
								<iconify-icon
									icon="mdi:folder-remove-outline"
									width="16"
									class="shrink-0 text-error-500"
									aria-hidden="true"
								></iconify-icon>
							{/if}
							<span class="truncate">{crumb.name}</span>
						</span>
					{:else}
						<a
							href={crumb.folderId ? `/mediagallery?folderId=${crumb.folderId}` : '/mediagallery'}
							class="inline-flex max-w-48 shrink-0 items-center gap-1 truncate rounded-md px-2 py-2 text-sm font-medium transition-colors sm:max-w-[16rem] sm:px-1.5 sm:py-1 sm:text-base
								{selectedFiles.size > 0
									? 'bg-surface-100 text-surface-800 hover:bg-primary-500/15 hover:text-primary-600 dark:bg-surface-800 dark:text-surface-100 dark:hover:text-primary-400'
									: 'hover:text-primary-500'}"
							data-preload="hover"
							data-media-drop-target={dropKey}
							data-testid={`media-breadcrumb-${dropKey}`}
							aria-label={selectedFiles.size > 0
								? `Move ${selectedFiles.size} selected to ${crumb.name}`
								: `Open folder ${crumb.name}`}
							title={selectedFiles.size > 0
								? `Move selection to ${crumb.name}`
								: `Drop media here (or open) — same as sidebar`}
							use:droppable={dropOptions}
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
						Tap a parent above, or drag an item onto a folder
					</span>
					<span class="hidden sm:inline">
						Drop {selectedFiles.size}
						{selectedFiles.size === 1 ? 'item' : 'items'} on a sidebar folder or breadcrumb parent to move
					</span>
				</p>
			{/if}
		</div>

		<!-- Toolbar -->
		<div class="shrink-0 px-2 sm:px-3" data-testid="media-gallery-toolbar">

			<!-- Mobile toolbar: search + expand button, then collapsible filters -->
			<div class="flex flex-col gap-1.5 py-2 sm:hidden">
				<div class="flex items-center gap-2">
					<div class="relative min-w-0 flex-1">
						<iconify-icon icon="mdi:magnify" class="pointer-events-none absolute inset-s-3 top-1/2 z-10 -translate-y-1/2 opacity-50" width="18"></iconify-icon>
						<Input
							id="media-gallery-search"
							bind:value={globalSearchValue}
							type="search"
							placeholder="Search media... (Mod+F)"
							class="w-full ps-9 pe-10 dark:border-surface-700/60 focus-visible:ring-1"
							aria-label="Search media assets"
						/>
						<span class="absolute inset-e-2 top-1/2 z-10 -translate-y-1/2">
							<Button
								type="button"
								variant="ghost"
								size="sm"
								onclick={() => (showAdvancedSearch = true)}
								aria-label="Advanced search and filters"
								class="h-7! w-7! min-w-0! px-0! {searchCriteria ? 'text-primary-500' : ''}"
							>
								<iconify-icon icon="mdi:filter-variant" width="16"></iconify-icon>
							</Button>
						</span>
					</div>
					<Button
						type="button"
						variant="outline"
						size="md"
						onclick={() => (mobileFiltersExpanded = !mobileFiltersExpanded)}
						aria-label={mobileFiltersExpanded ? 'Hide filters' : 'Show filters'}
						aria-expanded={mobileFiltersExpanded}
						class="h-10 w-10 shrink-0 px-0!"
					>
						<iconify-icon
							icon="mdi:chevron-down"
							width="18"
							class="transition-transform duration-200 {mobileFiltersExpanded ? 'rotate-180' : ''}"
						></iconify-icon>
					</Button>
				</div>

				{#if mobileFiltersExpanded}
					<div transition:slide={{ duration: 200 }} class="flex flex-col gap-1.5 pb-1">
						<div class="flex gap-2">
							{#if view === 'grid'}
								<label for="media-type-filter-m" class="sr-only">Filter by media type</label>
								<Select id="media-type-filter-m" bind:value={selectedMediaType} options={mediaTypeOptions} placeholder="Type" class="flex-1" />
							{/if}
							<label for="sort-by-filter-m" class="sr-only">Sort by</label>
							<Select id="sort-by-filter-m" bind:value={sortBy} options={sortOptions} placeholder="Sort" class="flex-1" />
						</div>
						<div class="relative min-w-0 w-full">
							<Input
								bind:value={jsonPathFilter}
								type="text"
								placeholder='JSON path… e.g. metadata.camera = Canon'
								class="w-full ps-2 text-xs"
								aria-label="Filter by JSON path (supports = != ~ > < ; AND)"
								title="Format: path = value · multi: a = 1; b > 2 · ops: = != ~ > < >= <="
							/>
						</div>
						<div class="flex items-center gap-2">
							<div class="flex overflow-hidden rounded border border-surface-300 dark:border-surface-600" role="group" aria-label="View mode">
								<Button type="button" variant={view === 'grid' ? 'primary' : 'ghost'} size="md" onclick={() => (view = 'grid')} aria-label="Grid view" aria-pressed={view === 'grid'} class="h-10! w-10! px-0!">
									<iconify-icon icon="mdi:grid-large" width="16"></iconify-icon>
								</Button>
								<Button type="button" variant={view === 'table' ? 'primary' : 'ghost'} size="md" onclick={() => (view = 'table')} aria-label="Table view" aria-pressed={view === 'table'} class="h-10! w-10! px-0! border-s border-surface-300 dark:border-surface-600">
									<iconify-icon icon="mdi:format-list-bulleted" width="16"></iconify-icon>
								</Button>
							</div>
							{#if view === 'grid'}
								<div class="flex overflow-hidden rounded border border-surface-300 dark:border-surface-600" role="group" aria-label="Grid size">
									{#each (['tiny', 'small', 'medium', 'large'] as const) as size, i (size)}
										<Button
											type="button"
											variant={gridSize === size ? 'primary' : 'ghost'}
											size="md"
											onclick={() => (gridSize = size)}
											aria-label="{size} grid"
											aria-pressed={gridSize === size}
											class="h-10! w-8! px-0! text-xs! {i > 0 ? 'border-s border-surface-300 dark:border-surface-600' : ''}"
										>
											{size === 'tiny' ? 'XS' : size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
										</Button>
									{/each}
								</div>
								<Button
									type="button"
									variant={isSelectionMode ? 'primary' : 'outline'}
									size="md"
									onclick={() => (isSelectionMode = !isSelectionMode)}
									aria-label="Toggle selection mode"
									aria-pressed={isSelectionMode}
									class="h-10 px-3"
								>
									{isSelectionMode ? 'Done' : 'Select'}
								</Button>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<!-- Desktop toolbar: single row -->
			<div class="hidden items-center gap-2 py-2 sm:flex">
				<div class="relative min-w-0 flex-1">
					<iconify-icon icon="mdi:magnify" class="pointer-events-none absolute inset-s-3 top-1/2 z-10 -translate-y-1/2 opacity-50" width="18"></iconify-icon>
					<Input
						id="media-gallery-search-desktop"
						bind:value={globalSearchValue}
						type="search"
						placeholder="Search media... (Mod+F)"
						class="w-full ps-9 pe-10 dark:border-surface-700/60 focus-visible:ring-1"
						aria-label="Search media assets"
					/>
					<span class="absolute inset-e-2 top-1/2 z-10 -translate-y-1/2">
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onclick={() => (showAdvancedSearch = true)}
							aria-label="Advanced Search"
							data-testid="media-advanced-search"
							class="h-7! w-7! min-w-0! px-0! {searchCriteria ? 'text-primary-500' : ''}"
						>
							<iconify-icon icon="mdi:filter-variant" width="16"></iconify-icon>
						</Button>
					</span>
				</div>

				{#if view === 'grid'}
					<div class="w-28 shrink-0">
						<label for="media-type-filter" class="sr-only">Filter by media type</label>
						<Select id="media-type-filter" bind:value={selectedMediaType} options={mediaTypeOptions} placeholder="Type" />
					</div>
				{/if}

				<div class="w-36 shrink-0">
					<label for="sort-by-filter" class="sr-only">Sort by</label>
					<Select id="sort-by-filter" bind:value={sortBy} options={sortOptions} placeholder="Sort" />
				</div>

				<div class="relative min-w-0 w-44 shrink-0">
					<Input
						bind:value={jsonPathFilter}
						type="text"
						placeholder='JSON path… e.g. metadata.camera = Canon'
						class="w-full ps-2 text-xs"
						aria-label="Filter by JSON path (supports = != ~ > < ; AND)"
						title="Format: path = value · multi: a = 1; b > 2 · ops: = != ~ > < >= <="
					/>
				</div>

				<!--
					Native <button> toggles (not Button component): guarantees aria-label,
					aria-pressed, data-testid and onclick stay on the DOM node for E2E/a11y.
				-->
				<div class="flex shrink-0 overflow-hidden rounded border border-surface-300 dark:border-surface-600" role="group" aria-label="View mode">
					<button
						type="button"
						onclick={() => (view = 'grid')}
						class="relative inline-flex h-10 w-10 min-w-0 items-center justify-center p-0 text-sm font-bold tracking-tight transition-all duration-200 hover:bg-surface-200/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-500 dark:hover:bg-surface-800/50 dark:focus-visible:ring-surface-300 {view === 'grid'
							? 'bg-primary-500 text-white'
							: 'text-surface-500 dark:text-surface-400'}"
						aria-label="Grid view"
						aria-pressed={view === 'grid' ? 'true' : 'false'}
						data-testid="media-view-grid"
					>
						<iconify-icon icon="mdi:grid-large" width="16" aria-hidden="true"></iconify-icon>
					</button>
					<button
						type="button"
						onclick={() => (view = 'table')}
						class="relative inline-flex h-10 w-10 min-w-0 items-center justify-center border-s border-surface-300 p-0 text-sm font-bold tracking-tight transition-all duration-200 hover:bg-surface-200/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-surface-500 dark:border-surface-600 dark:hover:bg-surface-800/50 dark:focus-visible:ring-surface-300 {view === 'table'
							? 'bg-primary-500 text-white'
							: 'text-surface-500 dark:text-surface-400'}"
						aria-label="Table view"
						aria-pressed={view === 'table' ? 'true' : 'false'}
						data-testid="media-view-table"
					>
						<iconify-icon icon="mdi:format-list-bulleted" width="16" aria-hidden="true"></iconify-icon>
					</button>
				</div>

				{#if view === 'grid'}
					<div class="flex shrink-0 overflow-hidden rounded border border-surface-300 dark:border-surface-600" role="group" aria-label="Grid size">
						{#each (['tiny', 'small', 'medium', 'large'] as const) as size, i (size)}
							<Button
								type="button"
								variant={gridSize === size ? 'primary' : 'ghost'}
								size="md"
								onclick={() => (gridSize = size)}
								aria-label="{size} grid"
								aria-pressed={gridSize === size}
								class="h-10! w-8! px-0! text-xs! {i > 0 ? 'border-s border-surface-300 dark:border-surface-600' : ''}"
							>
								{size === 'tiny' ? 'XS' : size === 'small' ? 'S' : size === 'medium' ? 'M' : 'L'}
							</Button>
						{/each}
					</div>

					<Button
						type="button"
						variant={isSelectionMode ? 'primary' : 'outline'}
						size="md"
						onclick={() => (isSelectionMode = !isSelectionMode)}
						aria-label="Toggle selection mode"
						aria-pressed={isSelectionMode}
						data-testid="media-selection-toggle"
						class="h-10 shrink-0 text-sm"
					>
						{isSelectionMode ? 'Exit Selection' : 'Select'}
					</Button>
				{/if}
			</div>

		</div>

		<!-- Content — data-view is the canonical E2E signal for grid/table mode -->
		<div
			class="relative flex min-h-0 flex-1 flex-col"
			data-testid="media-gallery-content"
			data-view={view}
		>
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

	<MediaDragPreview />

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
