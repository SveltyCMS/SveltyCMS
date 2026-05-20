<!--
@file src/routes/(app)/mediagallery/+page.svelte
@component
**Enhanced Media Gallery Page**
Features:
- Global Hotkeys via src/utils/hotkeys.ts
-->

<script lang="ts">
import { onMount } from "svelte";
import type { PageData } from "./$types";
import MediaGrid from "./media-grid.svelte";
import MediaTable from "./media-table.svelte";
import VirtualMediaGrid from "./virtual-media-grid.svelte";
import { mediaUrl } from "@utils/media/media-utils";
import ImageEditorModal from "@src/components/image-editor/image-editor-modal.svelte";
import MediaDetailsModal from "@src/components/media/media-details-modal.svelte";
import PageTitle from "@src/components/page-title.svelte";
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

let { data }: { data: PageData } = $props();

// State
let files = $state<Array<MediaBase | MediaImage>>([]);
let globalSearchValue = $state("");
let selectedMediaType = $state<"All" | MediaTypeEnum>("All");
let view = $state<"grid" | "table">("grid");
let gridSize = $state<"tiny" | "small" | "medium" | "large">("small");
let selectedFiles = $state(new SvelteSet<string>());
let isSelectionMode = $state(false);

const mediaTypes = [
	{ value: "All", label: "ALL" },
	{ value: MediaTypeEnum.Image, label: "IMAGE" },
	{ value: MediaTypeEnum.Document, label: "DOCUMENT" },
	{ value: MediaTypeEnum.Audio, label: "AUDIO" },
	{ value: MediaTypeEnum.Video, label: "VIDEO" },
];

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

const USE_VIRTUAL_THRESHOLD = 100;
const useVirtualScrolling = $derived(
	filteredFiles.length > USE_VIRTUAL_THRESHOLD,
);

// Focus management
let searchInput: HTMLInputElement | undefined = $state();

onMount(() => {
	// Register Keyboard Shortcuts
	registerHotkey("mod+f", () => searchInput?.focus(), "Focus Search");
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

	// Initial data hydration
	if (data?.media) files = data.media as unknown as (MediaBase | MediaImage)[];
});

async function handleEditImage(file: any) {
	const fullUrl = mediaUrl(file);
	if (!fullUrl) {
		toast.error("Invalid image URL");
		return;
	}

	modalState.trigger(ImageEditorModal as any, {
		image: { ...file, url: fullUrl },
		onsave: handleEditorSave,
		size: "fullscreen",
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
		// We send JSON instructions to the manipulate endpoint.
		const response = await fetch(`/api/media/manipulate/${mediaId}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(manipulations),
		});

		if (response.ok) {
			const { data: updatedMedia } = await response.json();
			toast.success("Image processed and saved");
			
			// 🚀 SPA-Friendly Update: Update local state instead of full reload
			if (updatedMedia) {
				const index = files.findIndex(f => f._id === updatedMedia._id);
				if (index !== -1) {
					files[index] = updatedMedia;
				} else {
					// If it was saved as "New", add it to the list
					files = [updatedMedia, ...files];
				}
			} else {
				// Fallback if data is missing
				window.location.reload();
			}
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

async function handleUpload(e: Event) {
	const input = e.target as HTMLInputElement;
	if (!input.files?.length) return;

	const formData = new FormData();
	for (const file of input.files) {
		formData.append("files", file);
	}
	formData.append("folder", data.currentFolder?._id || "global");

	try {
		const response = await fetch("?/upload", {
			method: "POST",
			body: formData,
		});
		if (response.ok) {
			toast.success("Media uploaded successfully");
			window.location.reload();
		}
	} catch (err) {
		logger.error("Upload failed", err);
		toast.error("Upload failed");
	}
}

async function handleCreateFolder() {
	showConfirm({
		title: "Create New Folder",
		body: `<input id="new-folder-name" type="text" class="input" placeholder="Folder name..." />`,
		onConfirm: async () => {
			const name = (document.getElementById("new-folder-name") as HTMLInputElement)?.value;
			if (!name) return;

			try {
				const response = await fetch("/api/system-virtual-folder", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name,
						parent: data.currentFolder?._id,
					}),
				});
				if (response.ok) {
					toast.success("Folder created");
					window.location.reload();
				}
			} catch (err) {
				logger.error("Folder creation failed", err);
				toast.error("Folder creation failed");
			}
		},
	});
}

async function handleOpenFileDetails(file: any) {
	modalState.trigger(MediaDetailsModal as any, {
		file,
		modalClasses: "max-w-4xl w-full",
		onUpdate: (updatedFile: any) => {
			const index = files.findIndex((f) => f._id === updatedFile._id);
			if (index !== -1) {
				files[index] = updatedFile;
			}
		}
	});
}
</script>

<div class="flex flex-col gap-4">
	<PageTitle 
		name="Media Gallery" 
		icon="bi:images" 
		showBackButton={true} 
		backUrl="/" 

	>
		{#snippet children()}
			<div class="flex items-center gap-2">
				<button 
					onclick={handleCreateFolder}
					class="btn preset-tonal-secondary"
					aria-label="Create new virtual folder"
				>
					<iconify-icon icon="mdi:folder-plus" width="20"></iconify-icon>
					<span class="hidden md:inline">New Folder</span>
				</button>

				<label class="btn preset-filled-primary-500 cursor-pointer">
					<iconify-icon icon="mdi:upload" width="20"></iconify-icon>
					<span class="hidden md:inline">Upload</span>
					<input 
						type="file" 
						multiple 
						class="hidden" 
						onchange={handleUpload}
						accept="image/*,video/*,audio/*,application/pdf"
					/>
				</label>
			</div>
		{/snippet}
	</PageTitle>

	<!-- Toolbar -->
	<div class="flex flex-wrap items-center justify-between gap-4 bg-surface-100 dark:bg-surface-800 p-4 rounded-xl shadow-sm border border-surface-200 dark:border-surface-700">
		<div class="flex-1 min-w-[300px] relative">
			<iconify-icon icon="mdi:magnify" class="absolute left-3 top-1/2 -translate-y-1/2 opacity-50" width="20"></iconify-icon>
			<input 
				bind:this={searchInput}
				bind:value={globalSearchValue}
				type="text" 
				placeholder="Search media... (Mod+F)" 
				class="input pl-10 w-full"
				aria-label="Search media assets"
			/>
		</div>

		<div class="flex items-center gap-2">
			<select bind:value={selectedMediaType} class="select w-32" aria-label="Filter by type">
				{#each mediaTypes as type}
					<option value={type.value}>{type.label}</option>
				{/each}
			</select>

			<div class="flex border border-surface-300 dark:border-surface-600 rounded-lg overflow-hidden">
				<button 
					onclick={() => view = 'grid'} 
					class="p-2 transition-colors {view === 'grid' ? 'bg-primary-500 text-white' : 'hover:bg-surface-200 dark:hover:bg-surface-700'}"
					aria-label="Grid view"
				>
					<iconify-icon icon="mdi:grid-large" width="20"></iconify-icon>
				</button>
				<button 
					onclick={() => view = 'table'} 
					class="p-2 transition-colors {view === 'table' ? 'bg-primary-500 text-white' : 'hover:bg-surface-200 dark:hover:bg-surface-700'}"
					aria-label="Table view"
				>
					<iconify-icon icon="mdi:format-list-bulleted" width="20"></iconify-icon>
				</button>
			</div>

			<button 
				onclick={() => isSelectionMode = !isSelectionMode}
				class="btn {isSelectionMode ? 'preset-filled-primary-500' : 'preset-tonal-surface'}"
			>
				{isSelectionMode ? 'Exit Selection' : 'Select'}
			</button>
		</div>
	</div>

	<!-- Content -->
	<div class="relative min-h-[400px]">
		{#if view === 'grid'}
			{#if useVirtualScrolling}
				<VirtualMediaGrid 
					filteredFiles={filteredFiles} 
					{gridSize} 
					{isSelectionMode}
					bind:selectedFiles={selectedFiles}
					onEditImage={handleEditImage} 
					onOpenFileDetails={handleOpenFileDetails}
				/>
			{:else}
				<MediaGrid 
					filteredFiles={filteredFiles} 
					{gridSize} 
					{isSelectionMode}
					bind:selectedFiles={selectedFiles}
					onEditImage={handleEditImage}
					onOpenFileDetails={handleOpenFileDetails}
				/>
			{/if}
		{:else}
			<MediaTable 
				filteredFiles={filteredFiles} 
				{isSelectionMode}
				bind:selectedFiles={selectedFiles}
				onEditImage={handleEditImage}
				onOpenFileDetails={handleOpenFileDetails}
			/>
		{/if}
	</div>
</div>
