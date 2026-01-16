<!--
@file src/components/VirtualFolder.svelte
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
	import { toaster } from '@stores/store.svelte';
	import { logger } from '@utils/logger';
	import { onMount } from 'svelte';
	// Stores
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { toggleUIElement, uiStateManager } from '@stores/UIStore.svelte';
	import { setMode } from '@stores/collectionStore.svelte';
	import { screenSize } from '@stores/screenSizeStore.svelte';
	import { get } from 'svelte/store';
	// Import types
	import type { SystemVirtualFolder } from '@src/databases/dbInterface';

	interface Props {
		// Component props and state
		currentFolder?: SystemVirtualFolder | null;
	}

	const { currentFolder = null }: Props = $props();
	let folders: SystemVirtualFolder[] = $state([]);
	let newFolderName = '';
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	// Determine if a folder is the root folder
	export function isRootFolder(folder: { name: string; parent?: string | null }): boolean {
		return folder.name === publicEnv.MEDIA_FOLDER && folder.parent === null;
	}

	// Fetch virtual folders from the API
	export async function fetchVirtualFolders(): Promise<void> {
		isLoading = true;
		error = null;
		try {
			const response = await fetch('/api/systemVirtualFolder');
			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			if (result.success && result.folders) {
				folders = result.folders.map((folder: any) => ({
					...folder,
					path: Array.isArray(folder.path) ? folder.path : folder.path.split('/')
				}));
			} else {
				throw new Error(result.error || 'Failed to fetch folders');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			error = message;
			toaster.error({ description: 'Error fetching folders: ' + message });
			folders = [];
		} finally {
			isLoading = false;
		}
	}

	// Create a new folder
	export async function createFolder(): Promise<void> {
		if (!newFolderName.trim()) return;
		isLoading = true;

		try {
			const response = await fetch('/api/systemVirtualFolder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: newFolderName,
					parent: currentFolder?._id
				})
			});

			if (!response.ok) {
				throw new Error(`HTTP error! status: ${response.status}`);
			}

			const result = await response.json();
			if (result.success) {
				toaster.success({ description: 'Folder created successfully' });
				newFolderName = '';
				await fetchVirtualFolders();
			} else {
				throw new Error(result.error || 'Failed to create folder');
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			error = message;
			toaster.error({ description: 'Error creating folder: ' + message });
		} finally {
			isLoading = false;
		}
	}

	// Update an existing folder
	export async function updateFolder(folderId: string, newName: string): Promise<void> {
		try {
			const response = await fetch('/api/systemVirtualFolder', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ folderId, name: newName })
			});
			const result = await response.json();

			if (result.success) {
				toaster.success({ description: 'Folder updated successfully' });
				await fetchVirtualFolders();
			} else {
				throw new Error(result.error || 'Failed to update folder');
			}
		} catch (error) {
			logger.error('Error updating folder:', error);
			toaster.error({ description: 'Error updating folder' });
		}
	}

	// Delete a folder
	export async function deleteFolder(folderId: string): Promise<void> {
		try {
			const response = await fetch('/api/systemVirtualFolder', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ folderId })
			});
			const result = await response.json();

			if (result.success) {
				toaster.success({ description: 'Folder deleted successfully' });
				await fetchVirtualFolders();
			} else {
				throw new Error(result.error || 'Failed to delete folder');
			}
		} catch (error) {
			logger.error('Error deleting folder:', error);
			toaster.error({ description: 'Error deleting folder' });
		}
	}

	// Handle mobile sidebar close on navigation
	function handleMobileSidebarClose() {
		if (get(screenSize) === 'SM') {
			toggleUIElement('leftSidebar', 'hidden');
		}
	}

	// Return to Collections - handle mode switching
	function handleReturnToCollections() {
		setMode('view');
		handleMobileSidebarClose();
	}

	// Fetch folders on component mount
	onMount(() => {
		fetchVirtualFolders();
	});
</script>

<div class="mt-2 overflow-y-auto">
	<!-- Return to Collections Button -->
	{#if uiStateManager.uiState.value.leftSidebar === 'full'}
		<!-- Sidebar Expanded -->
		<a
			href="/"
			onclick={handleReturnToCollections}
			aria-label="Return to Collections"
			class="btn mt-1 flex w-full flex-row items-center justify-start bg-surface-400 py-2 pl-2 text-white dark:bg-surface-500"
			data-sveltekit-preload-data="hover"
		>
			<iconify-icon icon="mdi:folder-multiple-outline" width="24" class="px-2 py-1 text-primary-600 rtl:ml-2"></iconify-icon>
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
			<iconify-icon icon="bi:collection" width="24" class="text-error-500"></iconify-icon>
			<p class="text-xs uppercase text-white">Collections</p>
		</a>
	{/if}

	<!-- Loading State -->
	{#if isLoading}
		<div class="flex w-full justify-center py-4">
			<iconify-icon icon="svg-spinners:bars-scale" width="24" class="text-primary-500"></iconify-icon>
		</div>
	{:else if error}
		<!-- Error State -->
		<div class="w-full pt-4 text-center">
			<p class="preset-outlined-error-500 btn w-full text-sm">{error}</p>
		</div>
	{:else if folders.length > 0}
		<div class="relative flex flex-wrap">
			{#each folders.filter((f) => !currentFolder || f.parentId === currentFolder?._id) as folder (folder._id)}
				{#if uiStateManager.uiState.value.leftSidebar === 'full'}
					<!-- Sidebar Expanded -->
					<div class="nowrap preset-outlined-surface-500 flex w-full">
						<a
							href={`/mediagallery?folderId=${folder._id}`}
							onclick={handleMobileSidebarClose}
							aria-label={`Open folder: ${folder.name}`}
							class="btn flex items-center space-x-2 p-2"
							data-sveltekit-preload-data="hover"
						>
							<iconify-icon icon="mdi:folder" width="28" class="text-yellow-500"></iconify-icon>
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
							<iconify-icon icon="mdi:folder" width="28" class="text-yellow-500"></iconify-icon>
							<span class="text-xs">{folder.name}</span>
						</a>
					</div>
				{/if}
			{/each}
		</div>
	{:else}
		<!-- No Folders Found Message -->
		<div class="w-full pt-4 text-center">
			<p class="preset-outlined-secondary-500 btn w-full text-sm text-warning-500">No folders</p>
		</div>
	{/if}
</div>
