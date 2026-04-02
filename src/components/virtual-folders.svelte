<!--
@file src\components\virtual-folders.svelte
@component
**VirtualFolder component for managing virtual folders in a media gallery**

@example
<VirtualFolder {currentFolder} />

### Props
- `currentFolder` (object): The currently selected folder.

### Events
- `updateFolder` (event): Emits an event when a folder is updated.
- `deleteFolder` (event): Emits an event when a folder is deleted.
- `createFolder` (event): Emits an event when a new folder is created.
- `navigateToFolder` (event): Emits an event when a folder is navigated to.
- `returnToCollections` (event): Emits an event when the "Return to Collections" button is clicked

### Features:
- Fetches and displays virtual folders
- Creates new folders
- Updates existing folders (except root)
- Deletes folders (except root)
- Navigates between folders
- Includes a "Return to Collections" button
- Supports both narrow and wide sidebar states
-->

<script lang="ts">
// Import types
import type { SystemVirtualFolder } from "@src/databases/db-interface";
import { setMode } from "@src/stores/collection-store.svelte.ts";
// Stores
import { publicEnv } from "@src/stores/global-settings.svelte";
import { screen } from "@src/stores/screen-size-store.svelte.ts";
import { ui } from "@src/stores/ui-store.svelte.ts";
import { logger } from "@utils/logger";
import { toast } from "@src/stores/toast.svelte.ts";
import { onMount } from "svelte";

interface Props {
	// Component props and state
	currentFolder?: SystemVirtualFolder | null;
}

const { currentFolder = null }: Props = $props();
let folders: SystemVirtualFolder[] = $state([]);
let newFolderName = $state("");
let isLoading = $state(false);
let error = $state<string | null>(null);

// Determine if a folder is the root folder
export function isRootFolder(folder: {
	name: string;
	parent?: string | null;
}): boolean {
	return folder.name === publicEnv.MEDIA_FOLDER && folder.parent === null;
}

// Fetch virtual folders from the API
export async function fetchVirtualFolders(): Promise<void> {
	isLoading = true;
	error = null;
	try {
		const response = await fetch("/api/system-virtual-folder");
		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const result = await response.json();
		if (result.success && result.folders) {
			folders = result.folders.map((folder: SystemVirtualFolder) => ({
				...folder,
				path: Array.isArray(folder.path)
					? folder.path
					: (folder.path as string).split("/"),
			}));
		} else {
			throw new Error(result.error || "Failed to fetch folders");
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		error = message;
		toast.error(`Error fetching folders: ${message}`);
		folders = [];
	} finally {
		isLoading = false;
	}
}

// Create a new folder
export async function createFolder(): Promise<void> {
	if (!newFolderName.trim()) {
		return;
	}
	isLoading = true;

	try {
		const response = await fetch("/api/system-virtual-folder", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				name: newFolderName,
				parent: currentFolder?._id,
			}),
		});

		if (!response.ok) {
			throw new Error(`HTTP error! status: ${response.status}`);
		}

		const result = await response.json();
		if (result.success) {
			toast.success("Folder created successfully");
			newFolderName = "";
			await fetchVirtualFolders();
		} else {
			throw new Error(result.error || "Failed to create folder");
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		error = message;
		toast.error(`Error creating folder: ${message}`);
	} finally {
		isLoading = false;
	}
}

// Update an existing folder
export async function updateFolder(
	folderId: string,
	newName: string,
): Promise<void> {
	try {
		const response = await fetch("/api/system-virtual-folder", {
			method: "PATCH",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ folderId, name: newName }),
		});
		const result = await response.json();

		if (result.success) {
			toast.success("Folder updated successfully");
			await fetchVirtualFolders();
		} else {
			throw new Error(result.error || "Failed to update folder");
		}
	} catch (error) {
		logger.error("Error updating folder:", error);
		toast.error("Error updating folder");
	}
}

// Delete a folder
export async function deleteFolder(folderId: string): Promise<void> {
	try {
		const response = await fetch("/api/system-virtual-folder", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ folderId }),
		});
		const result = await response.json();

		if (result.success) {
			toast.success("Folder deleted successfully");
			await fetchVirtualFolders();
		} else {
			throw new Error(result.error || "Failed to delete folder");
		}
	} catch (error) {
		logger.error("Error deleting folder:", error);
		toast.error("Error deleting folder");
	}
}

// Handle mobile sidebar close on navigation
function handleMobileSidebarClose() {
	if (screen.isMobile) {
		ui.toggle("leftSidebar", "hidden");
	}
}

// Return to Collections - handle mode switching
function handleReturnToCollections() {
	setMode("view");
	handleMobileSidebarClose();
}

// Fetch folders on component mount
onMount(() => {
	fetchVirtualFolders();
});
</script>

<div class="mt-2 flex flex-col gap-1 overflow-y-auto max-h-[70vh]">
	<!-- Create Folder Input (Sidebar-style) -->
	{#if ui.state.leftSidebar === 'full'}
		<div class="flex items-center gap-1 p-1 bg-surface-100/50 dark:bg-surface-800/50 rounded mb-2">
			<input 
				bind:value={newFolderName}
				type="text" 
				placeholder="New folder..." 
				class="input input-sm bg-transparent border-none focus:ring-0 text-sm"
				onkeydown={(e) => e.key === 'Enter' && createFolder()}
			/>
			<button 
				onclick={createFolder}
				class="btn btn-sm btn-icon bg-surface-200 dark:bg-surface-700" 
				disabled={!newFolderName.trim()}
				aria-label="Create Folder"
			>
				<iconify-icon icon="mdi:plus" width="16"></iconify-icon>
			</button>
		</div>
	{/if}
	<!-- Return to Collections Button -->
	{#if ui.state.leftSidebar === 'full'}
		<!-- Sidebar Expanded -->
		<a
			href="/"
			onclick={handleReturnToCollections}
			aria-label="Return to Collections"
			class="btn mt-1 flex w-full flex-row items-center justify-start bg-surface-400 py-2 pl-2 text-white dark:bg-surface-500"
			data-sveltekit-preload-data="hover"
		>
			<iconify-icon icon="mdi:folder-multiple" width={24}></iconify-icon>
			<p class="mr-auto text-center uppercase">Collections</p>
		</a>
	{:else}
		<!-- Sidebar Collapsed -->
		<a
			href="/"
			onclick={handleReturnToCollections}
			aria-label="Return to Collections"
			class="btn mt-2 flex-col bg-surface-400 uppercase text-white hover:bg-surface-300! dark:bg-surface-500"
			data-sveltekit-preload-data="hover"
		>
			<iconify-icon icon="mdi:folder-multiple" width={24}></iconify-icon>
			<p class="text-xs uppercase text-white">Collections</p>
		</a>
	{/if}

	<!-- Loading State -->
	{#if isLoading}
		<div class="flex w-full justify-center py-4"><iconify-icon icon="mdi:loading" width={24} class="animate-spin"></iconify-icon></div>
	{:else if error}
		<!-- Error State -->
		<div class="w-full pt-4 text-center">
			<p class="variant-outline-error btn w-full text-sm">{error}</p>
		</div>
	{:else if folders.length > 0}
		<div class="relative flex flex-wrap">
			{#each folders.filter((f) => !currentFolder || f.parentId === currentFolder?._id) as folder (folder._id)}
				{#if ui.state.leftSidebar === 'full'}
					<!-- Sidebar Expanded -->
					<div class="nowrap variant-outline-surface flex w-full">
						<a
							href={`/mediagallery?folderId=${folder._id}`}
							onclick={handleMobileSidebarClose}
							aria-label={`Open folder: ${folder.name}`}
							class="btn flex items-center space-x-2 p-2"
							data-sveltekit-preload-data="hover"
						>
							<iconify-icon icon="bi:folder" width="28" class="text-yellow-500"></iconify-icon>
							<span class="flex-1 overflow-hidden text-ellipsis text-left text-sm">{folder.name}</span>
						</a>
					</div>
				{:else}
					<!-- Sidebar Collapsed -->
					<div
						class="nowrap mt-2 flex w-full flex-col items-center rounded bg-surface-400 uppercase text-white hover:bg-surface-300! dark:bg-surface-500"
					>
						<a
							href={`/mediagallery?folderId=${folder._id}`}
							onclick={handleMobileSidebarClose}
							aria-label={`Open folder: ${folder.name}`}
							class="btn flex flex-col items-center p-2"
							data-sveltekit-preload-data="hover"
						>
							<iconify-icon icon="bi:folder" width="28" class="text-yellow-500"></iconify-icon>
							<span class="text-xs">{folder.name}</span>
						</a>
					</div>
				{/if}
			{/each}
		</div>
	{:else}
		<!-- Fallback: Ensure root is visible even if fetch fails or is empty -->
		<div class="relative flex flex-wrap">
			<div class="nowrap variant-outline-surface flex w-full">
				<a
					href="/mediagallery"
					onclick={handleMobileSidebarClose}
					aria-label="Open Root Folder"
					class="btn flex w-full items-center space-x-2 p-2 hover:bg-surface-100/10"
					data-sveltekit-preload-data="hover"
				>
					<iconify-icon icon="bi:folder" width="28" class="text-yellow-500"></iconify-icon>
					<span class="flex-1 overflow-hidden text-ellipsis text-left text-sm">{publicEnv.MEDIA_FOLDER || 'Media Root'}</span>
				</a>
			</div>
		</div>
	{/if}
</div>
