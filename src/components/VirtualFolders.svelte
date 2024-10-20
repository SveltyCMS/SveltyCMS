<!--
@file src/components/VirtualFolder.svelte
@description VirtualFolder component
-->

<!-- src/components/VirtualFolders.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { getToastStore } from '@skeletonlabs/skeleton';
	import { goto } from '$app/navigation';

	const toastStore = getToastStore();

	// Define variables
	export let currentFolder: { _id: string; name: string; path: string[] } | null = null;
	let folders: { _id: string; name: string; path: string[]; parent?: string | null }[] = [];
	let newFolderName = '';

	// Function to fetch virtual folders
	async function fetchVirtualFolders() {
		try {
			const response = await fetch('/api/virtualFolder');
			const result = await response.json();

			if (result.success && result.folders) {
				folders = result.folders.map((folder) => ({
					...folder,
					path: Array.isArray(folder.path) ? folder.path : folder.path.split('/')
				}));
				console.log('Fetched virtual folders:', folders);
			} else {
				throw Error(result.error || 'Failed to fetch folders');
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

	// Function to create a new folder
	async function createFolder() {
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
				throw Error(result.error || 'Failed to create folder');
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

	// Function to update a folder
	async function updateFolder(folderId: string, newName: string) {
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
				throw Error(result.error || 'Failed to update folder');
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

	// Function to delete a folder
	async function deleteFolder(folderId: string) {
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
				throw Error(result.error || 'Failed to delete folder');
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

	// Function to navigate to a folder
	async function openFolder(folderId: string | null) {
		if (folderId === null) {
			// Navigate to root
			await goto('/mediagallery');
		} else {
			// Navigate to the selected folder
			await goto(`/mediagallery?folderId=${folderId}`);
		}
	}

	// Fetch folders on component mount
	onMount(() => {
		fetchVirtualFolders();
	});
</script>

{#if folders.length > 0}
	<div class="relative flex">
		{#each folders.filter((f) => !currentFolder || f.parent === currentFolder._id) as folder (folder._id)}
			<div class="btn-group">
				<!-- Folder Button -->
				<button on:click={() => openFolder(folder._id)} class="btn" aria-label={folder.name}>
					<iconify-icon icon="mdi:folder" width="28" class="text-yellow-500"> </iconify-icon>
					<span class="flex-1 overflow-hidden text-ellipsis text-left text-sm">{folder.name}</span>
				</button>
				<!-- Edit and Delete buttons -->
				<div class="absolute right-0 top-0 flex">
					<button
						on:click={() => updateFolder(folder._id, prompt('Enter new folder name', folder.name) || folder.name)}
						class="btn"
						aria-label="Edit"
					>
						<iconify-icon icon="mdi:pencil" width="18" class="text-white"> </iconify-icon>
					</button>
					<button on:click={() => deleteFolder(folder._id)} class="btn" aria-label="Delete">
						<iconify-icon icon="mdi:delete" width="18" class="text-white"> </iconify-icon>
					</button>
				</div>
			</div>
		{/each}
	</div>
{:else}
	<!-- No Folders Found Message -->
	<div class="w-full pt-1 text-center">
		<p class="variant-outline-secondary btn text-warning-500">No folders</p>
	</div>
{/if}
