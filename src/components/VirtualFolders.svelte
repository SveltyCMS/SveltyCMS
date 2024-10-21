<!--
@file src/components/VirtualFolder.svelte
@description VirtualFolder component for managing virtual folders in a media gallery

Features:
- Fetches and displays virtual folders
- Creates new folders
- Updates existing folders (except root)
- Deletes folders (except root)
- Navigates between folders
- Includes a "Return to Collections" button
- Supports both narrow and wide sidebar states

Usage:
<VirtualFolder {currentFolder} />
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { getToastStore } from '@skeletonlabs/skeleton';
	import { goto } from '$app/navigation';
	import { publicEnv } from '@root/config/public';
	import { sidebarState, toggleSidebar } from '@stores/sidebarStore';
	import { screenSize } from '@stores/screenSizeStore';
	import { mode } from '@stores/collectionStore';
	import { get } from 'svelte/store';

	// Toast notifications
	const toastStore = getToastStore();

	// Component props and state
	export let currentFolder: { _id: string; name: string; path: string[] } | null = null;
	let folders: Array<{
		_id: string;
		name: string;
		path: string[];
		parent?: string | null;
	}> = [];
	let newFolderName = '';

	// Determine if a folder is the root folder
	function isRootFolder(folder: { name: string; parent?: string | null }): boolean {
		return folder.name === publicEnv.MEDIA_FOLDER && folder.parent === null;
	}

	// Fetch virtual folders from the API
	async function fetchVirtualFolders(): Promise<void> {
		try {
			const response = await fetch('/api/virtualFolder');
			const result = await response.json();

			if (result.success && result.folders) {
				folders = result.folders.map((folder: any) => ({
					...folder,
					path: Array.isArray(folder.path) ? folder.path : folder.path.split('/')
				}));
				console.log('Fetched virtual folders:', folders);
			} else {
				throw new Error(result.error || 'Failed to fetch folders');
			}
		} catch (error) {
			console.error('Error fetching folders:', error);
			toastStore.trigger({
				message: 'Error fetching folders',
				background: 'variant-filled-error',
				timeout: 3000
			});
			folders = [];
		}
	}

	// Create a new folder
	async function createFolder(): Promise<void> {
		if (!newFolderName.trim()) return;

		try {
			const response = await fetch('/api/virtualFolder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: newFolderName, parent: currentFolder?._id })
			});
			const result = await response.json();

			if (result.success) {
				toastStore.trigger({
					message: 'Folder created successfully',
					background: 'variant-filled-success',
					timeout: 3000
				});
				newFolderName = '';
				await fetchVirtualFolders();
			} else {
				throw new Error(result.error || 'Failed to create folder');
			}
		} catch (error) {
			console.error('Error creating folder:', error);
			toastStore.trigger({
				message: 'Error creating folder',
				background: 'variant-filled-error',
				timeout: 3000
			});
		}
	}

	// Update an existing folder
	async function updateFolder(folderId: string, newName: string): Promise<void> {
		try {
			const response = await fetch('/api/virtualFolder', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ folderId, name: newName })
			});
			const result = await response.json();

			if (result.success) {
				toastStore.trigger({
					message: 'Folder updated successfully',
					background: 'variant-filled-success',
					timeout: 3000
				});
				await fetchVirtualFolders();
			} else {
				throw new Error(result.error || 'Failed to update folder');
			}
		} catch (error) {
			console.error('Error updating folder:', error);
			toastStore.trigger({
				message: 'Error updating folder',
				background: 'variant-filled-error',
				timeout: 3000
			});
		}
	}

	// Delete a folder
	async function deleteFolder(folderId: string): Promise<void> {
		try {
			const response = await fetch('/api/virtualFolder', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ folderId })
			});
			const result = await response.json();

			if (result.success) {
				toastStore.trigger({
					message: 'Folder deleted successfully',
					background: 'variant-filled-success',
					timeout: 3000
				});
				await fetchVirtualFolders();
			} else {
				throw new Error(result.error || 'Failed to delete folder');
			}
		} catch (error) {
			console.error('Error deleting folder:', error);
			toastStore.trigger({
				message: 'Error deleting folder',
				background: 'variant-filled-error',
				timeout: 3000
			});
		}
	}

	// Navigate to a folder
	async function openFolder(folderId: string | null): Promise<void> {
		if (folderId === null) {
			// Navigate to root
			await goto('/mediagallery');
		} else {
			// Navigate to the selected folder
			await goto(`/mediagallery?folderId=${folderId}`);
		}
	}

	// Return to Collections
	function returnToCollections(): void {
		mode.set('view');
		goto('/'); // Adjust this route as needed
		if (get(screenSize) === 'sm') {
			toggleSidebar('left', 'hidden');
		}
	}

	// Fetch folders on component mount
	onMount(() => {
		fetchVirtualFolders();
	});
</script>

<div class="mt-2 overflow-y-auto">
	<!-- Return to Collections Button -->
	{#if $sidebarState.left === 'full'}
		<!-- Sidebar Expanded -->
		<button
			class="btn mt-1 flex w-full flex-row items-center justify-start bg-surface-400 py-2 pl-2 text-white dark:bg-surface-500"
			on:click={returnToCollections}
		>
			<iconify-icon icon="mdi:folder-multiple-outline" width="24" class="px-2 py-1 text-primary-600 rtl:ml-2" />
			<p class="mr-auto text-center uppercase">Collections</p>
		</button>
	{:else}
		<!-- Sidebar Collapsed -->
		<button
			aria-label="Return to Collections"
			class="btn mt-2 flex-col bg-surface-400 uppercase text-white hover:!bg-surface-300 dark:bg-surface-500"
			on:click={returnToCollections}
		>
			<iconify-icon icon="bi:collection" width="24" class="text-error-500" />
			<p class="text-xs uppercase text-white">Collections</p>
		</button>
	{/if}

	<!-- Virtual Folders -->
	{#if folders.length > 0}
		<div class="relative flex flex-wrap">
			{#each folders.filter((f) => !currentFolder || f.parent === currentFolder?._id) as folder (folder._id)}
				{#if $sidebarState.left === 'full'}
					<!-- Sidebar Expanded -->
					<div class="nowrap variant-outline-surface flex w-full">
						<button on:click={() => openFolder(folder._id)} class="btn flex items-center space-x-2 p-2" aria-label={`Open folder: ${folder.name}`}>
							<iconify-icon icon="mdi:folder" width="28" class="text-yellow-500" />
							<span class="flex-1 overflow-hidden text-ellipsis text-left text-sm">{folder.name}</span>
						</button>
					</div>
				{:else}
					<!-- Sidebar Collapsed -->
					<div
						class="nowrap mt-2 flex w-full flex-col items-center rounded bg-surface-400 uppercase text-white hover:!bg-surface-300 dark:bg-surface-500"
					>
						<button on:click={() => openFolder(folder._id)} class="btn flex flex-col items-center p-2" aria-label={`Open folder: ${folder.name}`}>
							<iconify-icon icon="mdi:folder" width="28" class="text-yellow-500" />
							<span class="text-xs">{folder.name}</span>
						</button>
					</div>
				{/if}
			{/each}
		</div>
	{:else}
		<!-- No Folders Found Message -->
		<div class="w-full pt-4 text-center">
			<p class="variant-outline-secondary btn w-full text-sm text-warning-500">No folders</p>
		</div>
	{/if}
</div>
