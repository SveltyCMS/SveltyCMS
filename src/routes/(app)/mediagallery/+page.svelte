<!--
@file src/routes/(app)/mediagallery/+page.svelte
@component
**Enhanced Media Gallery Page**
Features:
- Global Hotkeys via src/utils/hotkeys.ts
-->

<script lang="ts">
import { onMount } from "svelte";
import { invalidateAll } from "$app/navigation";
import { page } from "$app/state";
import type { PageData } from "./$types";
import MediaGrid from "./media-grid.svelte";
import MediaTable from "./media-table.svelte";
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
import { modalState } from "@utils/modal.svelte";
import { showConfirm } from "@utils/modal.svelte";
import { registerHotkey } from "@src/utils/hotkeys";
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
	return files.filter((file) => {
		const matchesSearch = (file.filename || "")
			.toLowerCase()
			.includes(globalSearchValue.toLowerCase());
		const matchesType =
			selectedMediaType === "All" || file.type === selectedMediaType;
		return matchesSearch && matchesType;
	});
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
	document.addEventListener("externalUpload", onExternalUpload);
	return () => document.removeEventListener("externalUpload", onExternalUpload);
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
		title: "Image Editor",
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
			const { data: updatedMedia } = await response.json();
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
				await fetch("/mediagallery?/deleteMedia", { method: "POST", body: formData });
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

	const formData = new FormData();
	for (const file of list) {
		formData.append("files", file);
	}
	formData.append("folder", data.currentFolder?._id || "global");

	isUploading = true;
	try {
		console.log("[MediaGallery] Sending upload request...");
		const response = await fetch("/mediagallery?/upload", {
			method: "POST",
			body: formData,
			headers: { accept: "application/json" },
		});
		console.log("[MediaGallery] Response status:", response.status);
		if (response.ok) {
			console.log("[MediaGallery] Upload success, reloading");
			toast.success("Media uploaded successfully");
			await invalidateAll();
		} else {
			toast.error("Upload failed");
		}
	} catch (err) {
		console.log("[MediaGallery] Catch error:", err);
		logger.error("Upload failed", err);
		toast.error("Upload failed");
	} finally {
		isUploading = false;
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

			<input aria-label="upload-files"
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
				<p
					class="border-b border-primary-500/30 py-2 text-xs text-surface-600 dark:text-surface-300"
					role="status"
					aria-live="polite"
				>
				<span class="font-medium text-surface-800 dark:text-surface-100">{assetStats.selected} selected</span>
				<span class="hidden text-surface-500 sm:inline dark:text-surface-400"> · Del to remove · Esc to clear</span>
				</p>
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
						class="w-full sm:w-36"
					/>
				{/if}

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

		{#if breadcrumbs.length > 1}
			<div class="shrink-0 px-2 sm:px-3">
				<nav
					class="flex min-w-0 items-center gap-2.5 overflow-x-auto border-b border-surface-200 py-2.5 text-base text-surface-500 dark:border-surface-800 dark:text-surface-400"
					aria-label="Folder path"
				>
					{#each breadcrumbs as crumb, i (crumb.folderId ?? 'root')}
						{#if i > 0}
							<iconify-icon
								icon="mdi:chevron-right"
								width="16"
								class="shrink-0 text-surface-400 dark:text-surface-500"
								aria-hidden="true"
							></iconify-icon>
						{/if}
						{#if i === breadcrumbs.length - 1}
							<span
								class="max-w-[12rem] shrink-0 truncate font-medium text-surface-800 sm:max-w-[16rem] dark:text-surface-100"
								aria-current="page"
							>{crumb.name}</span>
						{:else}
							<a
								href={crumb.folderId ? `/mediagallery?folderId=${crumb.folderId}` : '/mediagallery'}
								class="shrink-0 truncate hover:text-primary-500"
								data-preload="hover"
							>{crumb.name}</a>
						{/if}
					{/each}
				</nav>
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
					onEditImage={handleEditImage}
					onOpenFileDetails={handleOpenFileDetails}
					ondeleteImage={handleDeleteImage}
					onUpdateImage={handleUpdateImage}
				/>
			{/if}
		</div>
	</div>

	<Slot name="media_gallery" />
</AdminPageShell>
