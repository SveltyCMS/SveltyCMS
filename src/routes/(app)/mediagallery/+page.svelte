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
import { mediaUrl } from "@utils/media/media-utils";
import ImageEditorModal from "@src/components/image-editor/image-editor-modal.svelte";
import ModalPrompt from "@components/modal-prompt.svelte";
import MediaDetailsModal from "@src/components/media/media-details-modal.svelte";
import AdminCard from '@components/admin-card.svelte';
import AdminPageShell from "@components/admin-page-shell.svelte";
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

	// Initial data hydration
	if (data?.media) files = data.media as unknown as (MediaBase | MediaImage)[];
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
				const response = await fetch("/api/system-virtual-folder", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						name: name.trim(),
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
	);
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

<AdminPageShell title="Media Gallery" icon="bi:images" showBackButton={true} backUrl="/" fullHeight={true} spaceY="4">
	{#snippet actions()}
		<div class="flex items-center gap-2">
			<Button variant="surface"
				onclick={handleCreateFolder}
				aria-label="Create new virtual folder"
			>
				<iconify-icon icon="mdi:folder-plus" width="20"></iconify-icon>
				<span class="hidden md:inline">New Folder</span>
			</Button>

			<Button color="var(--color-primary-500)" onclick={() => fileUploadInput?.click()}>
				<iconify-icon icon="mdi:upload" width="20"></iconify-icon>
				<span class="hidden md:inline">Upload</span>
			</Button>
			<input
				type="file"
				multiple
				class="hidden"
				bind:this={fileUploadInput}
				onchange={handleUpload}
				accept="image/*,video/*,audio/*,application/pdf"
				aria-label="upload-files"
				data-testid="media-upload-input"
			/>
		</div>
	{/snippet}

	<div class="flex min-h-0 flex-1 flex-col gap-3">
		<!-- Toolbar -->
		<AdminCard
			class="flex shrink-0 flex-col gap-2.5 border border-surface-200 bg-white p-2.5 shadow-sm sm:flex-row sm:items-center dark:border-surface-700 dark:bg-surface-900/50"
			data-testid="media-gallery-toolbar"
		>
			<div class="relative w-full sm:flex-1 sm:min-w-48">
				<iconify-icon icon="mdi:magnify" class="pointer-events-none absolute inset-s-3 top-1/2 z-10 -translate-y-1/2 opacity-50" width="20"></iconify-icon>
				<Input
					id="media-gallery-search"
					bind:value={globalSearchValue}
					type="search"
					placeholder="Search media... (Mod+F)"
					class="ps-10 w-full"
					aria-label="Search media assets"
				/>
			</div>

			<div class="flex flex-wrap items-center gap-2">
				<label for="media-type-filter" class="sr-only">Filter by media type</label>
				<Select
					id="media-type-filter"
					bind:value={selectedMediaType}
					options={mediaTypeOptions}
					placeholder="Type"
					class="w-32 sm:w-36"
				/>

				<div class="flex h-10 shrink-0 overflow-hidden rounded border border-surface-300 dark:border-surface-600" role="group" aria-label="View mode">
					<Button
						variant={view === 'grid' ? 'primary' : 'ghost'}
						size="sm"
						color={view === 'grid' ? 'var(--color-primary-500)' : undefined}
						onclick={() => (view = 'grid')}
						class="h-full rounded-none px-3 {view !== 'grid' ? 'hover:bg-surface-200 dark:hover:bg-surface-700' : ''}"
						aria-label="Grid view"
						aria-pressed={view === 'grid'}
					>
						<iconify-icon icon="mdi:grid-large" width="20"></iconify-icon>
					</Button>
					<Button
						variant={view === 'table' ? 'primary' : 'ghost'}
						size="sm"
						color={view === 'table' ? 'var(--color-primary-500)' : undefined}
						onclick={() => (view = 'table')}
						class="h-full rounded-none px-3 {view !== 'table' ? 'hover:bg-surface-200 dark:hover:bg-surface-700' : ''}"
						aria-label="Table view"
						aria-pressed={view === 'table'}
					>
						<iconify-icon icon="mdi:format-list-bulleted" width="20"></iconify-icon>
					</Button>
				</div>

				<Button
					variant={isSelectionMode ? 'surface' : 'outline'}
					color={isSelectionMode ? 'var(--color-primary-500)' : undefined}
					onclick={() => (isSelectionMode = !isSelectionMode)}
					aria-label="Toggle selection mode"
					aria-pressed={isSelectionMode}
				>
					{isSelectionMode ? 'Exit Selection' : 'Select'}
				</Button>
			</div>
		</AdminCard>

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
				/>
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
</AdminPageShell>
