<!-- 
@file src/routes/(app)/mediagallery/+page.svelte 
@description This component sets up and displays the media gallery page. 
It provides a user-friendly interface for searching, filtering, and navigating through media files.
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import type { MediaImage } from '@src/utils/types';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { dbAdapter } from '@src/databases/db';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import MediaGrid from './MediaGrid.svelte';
	import MediaTable from './MediaTable.svelte';

	// Stores
	import { mode } from '@src/stores/store';

	// Skeleton
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	let files: MediaImage[] = [];
	let folders: any[] = [];
	let currentFolder: string | null = null;
	let globalSearchValue = '';
	let selectedMediaType = 'All';
	let view: 'grid' | 'table' = 'grid';
	let gridSize: 'small' | 'medium' | 'large' = 'small';
	let tableSize: 'small' | 'medium' | 'large' = 'small';

	onMount(async () => {
		mode.set('media');
		await fetchFolders();
		await fetchMediaFiles();
	});

	// Open add virtual folder modal
	function openAddFolderModal() {
		// Default to MEDIA_FOLDER, which should represent the root directory
		let currentFolderPath = publicEnv.MEDIA_FOLDER;

		// Check if the currentFolder is set (i.e., the user is in a subfolder)
		if (currentFolder) {
			const folder = folders.find((f) => f._id === currentFolder);
			if (folder && folder.path) {
				currentFolderPath = folder.path; // Update the path to the current folder's path
			}
		}

		console.log('Current Folder Path:', currentFolderPath);

		const modal: ModalSettings = {
			type: 'prompt',
			title: 'Add Folder',
			body: `Creating subfolder in: ${currentFolderPath}`, // Display the current folder path in the modal
			placeholder: 'New Folder Name',
			response: (r: string) => {
				if (r) createFolder(r); // Pass the new folder name to createFolder function
			}
		};

		modalStore.trigger(modal); // Trigger the modal to open
	}

	// Fetch virtual folders
	async function fetchFolders() {
		try {
			const response = await fetch('/api/virtualFolder');
			const result = await response.json();

			if (result.success && result.folders) {
				folders = result.folders;
				console.log('Fetched folders:', folders);
			} else {
				throw new Error(result.error || 'Failed to fetch folders');
			}

			// Check if the folder exists
			if (folders.length === 0) {
				await createFolder('Root');
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

	async function updateFolder(folderId: string, newName: string, newParentId?: string) {
		try {
			const response = await fetch('/api/virtualFolder', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ folderId, name: newName, parent: newParentId })
			});

			const result = await response.json();

			if (result.success) {
				toastStore.trigger({
					message: 'Folder updated successfully',
					background: 'variant-filled-success',
					timeout: 3000
				});
				await fetchFolders(); // Refresh the folders list
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			console.error('Error updating folder:', error);
			toastStore.trigger({
				message: 'Failed to update folder',
				background: 'variant-filled-error',
				timeout: 3000
			});
		}
	}

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
				await fetchFolders(); // Refresh the folders list
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			console.error('Error deleting folder:', error);
			toastStore.trigger({
				message: 'Failed to delete folder',
				background: 'variant-filled-error',
				timeout: 3000
			});
		}
	}

	// Fetch media files
	async function fetchMediaFiles() {
		try {
			const response = currentFolder ? await fetch(`/api/virtualFolder/${currentFolder}`) : await fetch('/api/media/all');
			const result = await response.json();

			if (result.success) {
				files = result.contents || [];
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			console.error('Error fetching media files:', error);
			toastStore.trigger({
				message: 'Error fetching media files',
				background: 'variant-filled-error',
				timeout: 3000
			});
			files = [];
		}
	}

	// Create virtual folder
	async function createFolder(name: string) {
		try {
			const parentFolder = folders.find((f) => f._id === currentFolder);
			const newPath = parentFolder ? `${parentFolder.path}/${name}` : `${publicEnv.MEDIASERVER_URL || publicEnv.MEDIA_FOLDER}/${name}`;

			const response = await fetch('/api/virtualFolder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					parent: currentFolder && currentFolder !== 'Root' ? currentFolder : undefined,
					path: newPath
				})
			});

			const result = await response.json();

			if (result.success) {
				console.log('New folder created:', result.folder);
				folders = [...folders, result.folder];
				toastStore.trigger({
					message: 'Folder created successfully',
					background: 'variant-filled-success',
					timeout: 3000
				});
				await fetchFolders(); // Fetch folders again to ensure everything is up to date
			} else {
				throw new Error(result.error);
			}
		} catch (error) {
			console.error('Error creating folder:', error);
			toastStore.trigger({
				message: 'Failed to create folder',
				background: 'variant-filled-error',
				timeout: 3000
			});
		}
	}

	// Open virtual folder
	async function openFolder(folderId: string) {
		currentFolder = folderId;
		await fetchMediaFiles();
	}

	// Handle delete image
	async function handleDeleteImage(event: CustomEvent<MediaImage>) {
		const image = event.detail;

		if (!image || !image._id) {
			console.error('Invalid image data received');
			return;
		}

		if (!dbAdapter) {
			console.error('Database adapter is not initialized.');
			toastStore.trigger({
				message: 'Error: Database adapter is not initialized',
				background: 'variant-filled-error',
				timeout: 3000
			});
			return;
		}

		try {
			const success = await dbAdapter.deleteMedia(image._id);

			if (success) {
				toastStore.trigger({
					message: 'Image deleted successfully.',
					background: 'variant-filled-success',
					timeout: 3000
				});
				await fetchMediaFiles();
			} else {
				throw new Error('Failed to delete image');
			}
		} catch (error) {
			console.error('Error deleting image:', error);
			toastStore.trigger({
				message: 'Error deleting image',
				background: 'variant-filled-error',
				timeout: 3000
			});
		}
	}

	// Handle user preferences
	function storeUserPreference(view: 'grid' | 'table', gridSize: 'small' | 'medium' | 'large', tableSize: 'small' | 'medium' | 'large') {
		localStorage.setItem('GalleryUserPreference', `${view}/${gridSize}/${tableSize}`);
	}

	function getUserPreferenceFromLocalStorageOrCookie(): string | null {
		return localStorage.getItem('GalleryUserPreference');
	}

	// Initialize user preferences
	const userPreference = getUserPreferenceFromLocalStorageOrCookie();
	if (userPreference) {
		const [preferredView, preferredGridSize, preferredTableSize] = userPreference.split('/');
		view = preferredView as 'grid' | 'table';
		gridSize = preferredGridSize as 'small' | 'medium' | 'large';
		tableSize = preferredTableSize as 'small' | 'medium' | 'large';
	}

	function handleClick() {
		if (view === 'grid') {
			gridSize = gridSize === 'small' ? 'medium' : gridSize === 'medium' ? 'large' : 'small';
		} else {
			tableSize = tableSize === 'small' ? 'medium' : tableSize === 'medium' ? 'large' : 'small';
		}
		storeUserPreference(view, gridSize, tableSize);
	}

	// Media types
	const mediaTypes = [
		{ value: 'All', icon: '' },
		{ value: 'Image', icon: 'mdi:image' },
		{ value: 'Document', icon: 'mdi:file-document' },
		{ value: 'Audio', icon: 'mdi:speaker' },
		{ value: 'Video', icon: 'mdi:movie' },
		{ value: 'RemoteVideo', icon: 'mdi:video-remote' }
	];

	// Reactive statement to filter files
	$: filteredFiles = files.filter(
		(file) => file.name.toLowerCase().includes(globalSearchValue.toLowerCase()) && (selectedMediaType === 'All' || file.type === selectedMediaType)
	);
</script>

<!-- PageTitle -->
<div class="my-2 flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
	<PageTitle name="Media Gallery" icon="bi:images" iconColor="text-tertiary-500 dark:text-primary-500" />
	<div class="mt-2 flex w-full justify-around gap-2 md:ml-auto md:mt-0 md:w-auto md:flex-row">
		<!-- Add folder -->
		<button class="variant-filled-tertiary btn gap-2" on:click={openAddFolderModal}>
			<iconify-icon icon="mdi:folder-add-outline" width="24" />
			Add folder
		</button>

		<!-- Add Media -->
		<button class="variant-filled-primary btn gap-2" on:click={() => goto('/mediagallery/uploadMedia')}>
			<iconify-icon icon="carbon:add-filled" width="24" />
			Add Media
		</button>
	</div>
</div>

<!-- Folders -->
<div class="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
	{#if currentFolder !== null && currentFolder !== 'Root'}
		<button on:click={() => openFolder('Root')} class="flex flex-col items-center justify-center rounded border p-4 hover:bg-gray-100">
			<iconify-icon icon="mdi:arrow-up-bold" width="48" class="text-blue-500" />
			<span class="mt-2 text-center">Back to Root</span>
		</button>
	{/if}

	{#each folders.filter((f) => f.parent === currentFolder) as folder (folder._id)}
		<div class="flex items-center justify-between">
			<button on:click={() => openFolder(folder._id)} class="flex flex-col items-center justify-center rounded border p-4 hover:bg-gray-100">
				<iconify-icon icon="mdi:folder" width="48" class="text-yellow-500" />
				<span class="mt-2 text-center">{folder.name}</span>
			</button>
			<button on:click={() => updateFolder(folder._id, 'New Folder Name')} class="text-blue-500">Rename</button>
			<button on:click={() => deleteFolder(folder._id)} class="text-red-500">Delete</button>
		</div>
	{/each}
</div>

<div class="wrapper overflow-auto">
	<div class="mb-8 flex w-full flex-col justify-center gap-1 md:hidden">
		<label for="globalSearch">Search</label>
		<div class="input-group input-group-divider grid max-w-md grid-cols-[auto_1fr_auto]">
			<input id="globalSearch" type="text" placeholder="Search" class="input" bind:value={globalSearchValue} />
			{#if globalSearchValue}
				<button on:click={() => (globalSearchValue = '')} class="variant-filled-surface w-12">
					<iconify-icon icon="ic:outline-search-off" width="24" />
				</button>
			{/if}
		</div>

		<div class="mt-4 flex justify-between">
			<div class="flex flex-col">
				<label for="mediaType">Type</label>
				<select id="mediaType" bind:value={selectedMediaType} class="input">
					{#each mediaTypes as type}
						<option value={type.value}>
							<p class="flex items-center gap-2">
								<iconify-icon icon={type.icon} width="24" class="text-primary-500" />
								<span class="uppercase">{type.value}</span>
							</p>
						</option>
					{/each}
				</select>
			</div>

			<div class="flex flex-col text-center">
				<label for="sortButton">Sort</label>
				<button id="sortButton" class="variant-ghost-surface btn" aria-label="Sort">
					<iconify-icon icon="flowbite:sort-outline" width="24" />
				</button>
			</div>

			<div class="flex items-center justify-center text-center text-xs md:hidden">
				<div class="flex flex-col items-center justify-center">
					<div class="flex sm:divide-x sm:divide-gray-500">
						{#if view === 'grid'}
							<button
								class="btn flex flex-col items-center justify-center px-1"
								on:click={() => {
									view = 'table';
									storeUserPreference(view, gridSize, tableSize);
								}}
							>
								<p class="text-center text-xs">Display</p>
								<iconify-icon icon="material-symbols:grid-view-rounded" height="42" style={`color: text-black dark:text-white`} />
								<p class="text-xs">Table</p>
							</button>
						{:else}
							<button
								class="btn flex flex-col items-center justify-center px-1"
								on:click={() => {
									view = 'grid';
									storeUserPreference(view, gridSize, tableSize);
								}}
							>
								<p class="text-center text-xs">Display</p>
								<iconify-icon icon="material-symbols:list-alt-outline" height="44" style={`color: text-black dark:text-white`} />
								<p class="text-center text-xs">Grid</p>
							</button>
						{/if}
					</div>
				</div>
				<div class="flex flex-col items-center">
					<p class="text-xs">Size</p>
					<div class="divide-surface-00 flex divide-x">
						{#if (view === 'grid' && gridSize === 'small') || (view === 'table' && tableSize === 'small')}
							<button type="button" class="px-1" on:click={handleClick}>
								<iconify-icon icon="material-symbols:background-grid-small-sharp" height="40" style={`color:text-black dark:text-white`} />
								<p class="text-xs">Small</p>
							</button>
						{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
							<button type="button" class="px-1" on:click={handleClick}>
								<iconify-icon icon="material-symbols:grid-on-sharp" height="40" style={`color: text-black dark:text-white`} />
								<p class="text-xs">Medium</p>
							</button>
						{:else}
							<button type="button" class="px-1" on:click={handleClick}>
								<iconify-icon icon="material-symbols:grid-view" height="40" style={`color: text-black dark:text-white`} />
								<p class="text-xs">Large</p>
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>

	<div class="mb-2 hidden items-center justify-between gap-1 md:flex md:gap-3">
		<div class="mb-8 flex w-full flex-col justify-center gap-1">
			<label for="globalSearchMd">Search</label>
			<div class="input-group input-group-divider grid max-w-md grid-cols-[auto_1fr_auto]">
				<input id="globalSearchMd" type="text" placeholder="Search" class="input" bind:value={globalSearchValue} />
				{#if globalSearchValue}
					<button on:click={() => (globalSearchValue = '')} class="variant-filled-surface w-12">
						<iconify-icon icon="ic:outline-search-off" width="24" />
					</button>
				{/if}
			</div>
		</div>

		<div class="mb-8 flex flex-col justify-center gap-1">
			<label for="mediaTypeMd">Type</label>
			<div class="input-group">
				<select id="mediaTypeMd" bind:value={selectedMediaType}>
					{#each mediaTypes as type}
						<option value={type.value}>
							<p class="flex items-center justify-between gap-2">
								<iconify-icon icon={type.icon} width="24" class="mr-2 text-primary-500" />
								<span class="uppercase">{type.value}</span>
							</p>
						</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="mb-8 flex flex-col justify-center gap-1 text-center">
			<label for="sortButton">Sort</label>
			<button id="sortButton" class="variant-ghost-surface btn" aria-label="Sort">
				<iconify-icon icon="flowbite:sort-outline" width="24" />
			</button>
		</div>

		<div class="flex items-center justify-center gap-4">
			<div class="hidden flex-col items-center sm:flex">
				Display
				<div class="flex divide-x divide-gray-500">
					<button
						class="px-2"
						on:click={() => {
							view = 'grid';
							storeUserPreference(view, gridSize, tableSize);
						}}
					>
						<iconify-icon icon="material-symbols:grid-view-rounded" height="40" style={`color: ${view === 'grid' ? 'black dark:white' : 'grey'}`} />
						<br /> <span class="text-tertiary-500 dark:text-primary-500">Grid</span>
					</button>
					<button
						class="px-2"
						on:click={() => {
							view = 'table';
							storeUserPreference(view, gridSize, tableSize);
						}}
					>
						<iconify-icon icon="material-symbols:list-alt-outline" height="40" style={`color: ${view === 'table' ? 'black dark:white' : 'grey'}`} />
						<br /><span class="text-tertiary-500 dark:text-primary-500">Table</span>
					</button>
				</div>
			</div>

			<div class="hidden flex-col items-center sm:flex">
				Size
				<div class="flex divide-x divide-gray-500">
					{#if (view === 'grid' && gridSize === 'small') || (view === 'table' && tableSize === 'small')}
						<button type="button" class="px-1 md:px-2" on:click={handleClick}>
							<iconify-icon icon="material-symbols:background-grid-small-sharp" height="40" />
							<br /><span class="text-tertiary-500 dark:text-primary-500">Small</span>
						</button>
					{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
						<button type="button" class="px-1 md:px-2" on:click={handleClick}>
							<iconify-icon icon="material-symbols:grid-on-sharp" height="40" />
							<br /><span class="text-tertiary-500 dark:text-primary-500">Medium</span>
						</button>
					{:else}
						<button type="button" class="px-1 md:px-2" on:click={handleClick}>
							<iconify-icon icon="material-symbols:grid-view" height="40" />
							<br /><span class="text-tertiary-500 dark:text-primary-500">Large</span>
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>

	{#if view === 'grid'}
		<MediaGrid {filteredFiles} {gridSize} on:deleteImage={handleDeleteImage} />
	{:else}
		<MediaTable {filteredFiles} {tableSize} on:deleteImage={handleDeleteImage} />
	{/if}
</div>
