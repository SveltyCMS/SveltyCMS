<!-- 
@file src/components/VirtualFolder.svelte
@description VirtualFolder component 
-->

<!-- src/components/VirtualFolders.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { publicEnv } from '@root/config/public';
	import { getToastStore } from '@skeletonlabs/skeleton';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	const toastStore = getToastStore();

	// Define variables
	export let currentFolder: { _id: string; name: string; path: string[] } | null = null;
	let folders: { _id: string; name: string; path: string[]; parent?: string | null }[] = [];

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

<!-- Virtual Folders UI -->
<div class="virtual-folders">
	{#if folders.length > 0}
		<div class="flex flex-col space-y-2">
			{#each folders.filter((f) => !currentFolder || f.parent === currentFolder._id) as folder (folder._id)}
				<div class="relative flex flex-col space-y-2">
					<!-- Folder Button -->
					<button
						on:click={() => openFolder(folder._id)}
						class="flex items-center space-x-2 rounded-lg border p-4 transition hover:bg-gray-200 dark:hover:bg-gray-700"
					>
						<iconify-icon icon="mdi:folder" width="28" class="text-yellow-500" />
						<span class="flex-1 overflow-hidden text-ellipsis text-left text-sm font-medium">{folder.name}</span>
					</button>
				</div>
			{/each}
		</div>
	{:else}
		<!-- No Folders Found Message -->
		<div class="py-10 text-center">
			<p class="text-lg text-gray-600 dark:text-gray-300">No folders found.</p>
		</div>
	{/if}
</div>
