<!-- 
@file src/routes/(app)/mediagallery/+page.svelte 
@description This component sets up and displays the media gallery page. 
It provides a user-friendly interface for searching, filtering, and navigating through media files.
-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { dbAdapter } from '@src/databases/db';

	// Media
	import { MediaTypeEnum, type MediaImage, type MediaType } from '@src/utils/media/mediaModels';
	import { SIZES } from '@src/utils/utils';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import Breadcrumb from '@components/Breadcrumb.svelte';
	import Filter from './Filter.svelte';
	import MediaGrid from './MediaGrid.svelte';
	import MediaTable from './MediaTable.svelte';

	// Stores
	import { mode } from '@src/stores/collectionStore';

	// Skeleton
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Prop to receive data from the server
	export let data;

	let files: MediaImage[] = [];

	let breadcrumb: string[] = [];
	let folders: { _id: string; name: string; path: string[]; parent?: string | null }[] = [];
	let currentFolder: { _id: string; name: string; path: string[] } | null = null;

	let globalSearchValue = '';
	let selectedMediaType = 'All';
	let view: 'grid' | 'table' = 'grid';
	let gridSize: 'small' | 'medium' | 'large' = 'small';
	let tableSize: 'small' | 'medium' | 'large' = 'small';

	onMount(() => {
		mode.set('media');
		console.log('Received data:', data); // Ensure this logs a valid structure

		if (data && data.virtualFolders) {
			folders = data.virtualFolders.map((folder) => ({
				...folder,
				path: Array.isArray(folder.path) ? folder.path : folder.path.split('/')
			}));
			console.log('Processed folders:', folders); // Ensure the structure is as expected
		} else {
			console.error('Virtual folders data is missing or in unexpected format');
			toastStore.trigger({
				message: 'Error loading folder structure',
				background: 'variant-filled-error',
				timeout: 3000
			});
		}

		fetchMediaFiles();
		updateBreadcrumb();
	});

	// Open add virtual folder modal
	function openAddFolderModal() {
		// Default to MEDIA_FOLDER, which should represent the root directory
		let currentFolderPath = publicEnv.MEDIA_FOLDER;

		// Check if the currentFolder is set (i.e., the user is in a subfolder)
		if (currentFolder) {
			currentFolderPath = currentFolder.path.join('/'); // Update the path to the current folder's path
		}

		const modal: ModalSettings = {
			type: 'prompt',
			title: 'Add Folder',
			// Apply inline style or use a CSS class to make the current folder path display in a different color
			body: `Creating subfolder in: <span class="text-tertiary-500 dark:text-primary-500">${currentFolderPath}</span>`, // Display the current folder path in a different color
			response: (r: string) => {
				if (r) createFolder(r); // Pass the new folder name to createFolder function
			}
		};

		modalStore.trigger(modal); // Trigger the modal to open
	}

	async function updateFolder(folderId: string, newName: string, newParentId?: string) {
		try {
			console.log(`Updating folder: ${folderId} with new name: ${newName}`);
			const response = await fetch('/api/virtualFolder', {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ folderId, name: newName, parent: newParentId })
			});

			const result = await response.json();

			if (result.success) {
				console.log('Folder updated successfully:', result);
				toastStore.trigger({
					message: 'Folder updated successfully',
					background: 'variant-filled-success',
					timeout: 3000
				});
				folders = await fetchUpdatedFolders(); // Refresh the folders list
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

	// Fetch media files
	async function fetchMediaFiles() {
		try {
			const folderId = currentFolder ? currentFolder._id : 'root';
			console.log(`Fetching media files for folder: ${folderId}`);

			const response = await fetch(`/api/virtualFolder/${folderId}`);
			const result = await response.json();

			if (result.success) {
				// Correctly assign mediaFiles to files
				files = Array.isArray(result.contents.mediaFiles) ? result.contents.mediaFiles : [];
				console.log('Fetched media files:', files);
			} else {
				throw new Error(result.error || 'Unknown error');
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

	// Create virtual folder with existence check
	async function createFolder(name: string) {
		try {
			const parentFolder = currentFolder ? folders.find((f) => f._id === currentFolder._id) : null;
			const newPath = parentFolder ? `${parentFolder.path.join('/')}/${name}` : `${publicEnv.MEDIA_FOLDER}/${name}`;

			// Check if the folder already exists
			const existingFolder = folders.find((folder) => folder.path.join('/') === newPath);
			if (existingFolder) {
				console.log('Folder already exists:', existingFolder);
				toastStore.trigger({
					message: 'Folder already exists.',
					background: 'variant-filled-warning',
					timeout: 3000
				});
				return;
			}

			console.log(`Creating new folder: ${name} with path: ${newPath}`);
			const response = await fetch('/api/virtualFolder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name,
					parent: currentFolder ? currentFolder._id : undefined,
					path: newPath
				})
			});

			const result = await response.json();

			if (result.success) {
				console.log('Folder created successfully:', result);
				toastStore.trigger({
					message: 'Folder created successfully',
					background: 'variant-filled-success',
					timeout: 3000
				});
				folders = await fetchUpdatedFolders(); // Refresh folder list
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
	async function openFolder(folderId: string | null) {
		console.log(`Opening folder: ${folderId}`);

		if (folderId === null) {
			// Navigate to root
			currentFolder = null;
		} else {
			// Set current folder to the selected one
			currentFolder = folders.find((f) => f._id === folderId) || null;
		}

		console.log('Current folder set to:', currentFolder);

		// Update breadcrumb based on the current folder
		updateBreadcrumb();

		// Fetch and display subfolders immediately after setting currentFolder
		if (currentFolder) {
			folders = await fetchUpdatedFolders();
		}

		// Fetch media files for the current folder
		await fetchMediaFiles();
	}

	// Fetch updated folders
	async function fetchUpdatedFolders() {
		try {
			console.log('Fetching updated folders');
			const response = await fetch('/api/virtualFolder');
			const result = await response.json();

			if (result.success && result.folders) {
				const updatedFolders = result.folders.map((folder) => ({
					...folder,
					path: Array.isArray(folder.path) ? folder.path : folder.path.split('/') // Ensure path is always an array
				}));
				console.log('Updated folders:', updatedFolders);
				return updatedFolders;
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
			return [];
		}
	}

	async function deleteFolder(folderId: string) {
		try {
			console.log(`Deleting folder: ${folderId}`);
			const response = await fetch('/api/virtualFolder', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ folderId })
			});

			const result = await response.json();

			if (result.success) {
				console.log('Folder deleted successfully:', result);
				toastStore.trigger({
					message: 'Folder deleted successfully',
					background: 'variant-filled-success',
					timeout: 3000
				});
				folders = await fetchUpdatedFolders(); // Refresh the folders list
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

	// Update breadcrumb
	function updateBreadcrumb() {
		if (currentFolder) {
			// Start with the root folder
			breadcrumb = [publicEnv.MEDIA_FOLDER];

			// Add the rest of the path
			if (currentFolder.path) {
				breadcrumb = breadcrumb.concat(currentFolder.path.slice(1));
			}
		} else {
			// Only show the root folder if no current folder is selected
			breadcrumb = [publicEnv.MEDIA_FOLDER];
		}
		console.log('Updated breadcrumb:', breadcrumb);
	}

	// Handle delete image
	async function handleDeleteImage(event: CustomEvent<MediaType>) {
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
			console.log(`Deleting image: ${image._id}`);
			const success = await dbAdapter.deleteMedia(image._id.toString());

			if (success) {
				console.log('Image deleted successfully');
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

	// Handle view change
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
	$: filteredFiles = files.filter((file) => {
		if (file.type === MediaTypeEnum.Image) {
			const sizeKey = Object.keys(SIZES).find((size) => file[size]?.name);

			if (sizeKey && file[sizeKey]?.name) {
				return (
					file[sizeKey].name.toLowerCase().includes(globalSearchValue.toLowerCase()) &&
					(selectedMediaType === 'All' || file.type === selectedMediaType)
				);
			}
			return false;
		} else {
			return file.name.toLowerCase().includes(globalSearchValue.toLowerCase()) && (selectedMediaType === 'All' || file.type === selectedMediaType);
		}
	});
</script>

<!-- Page Title and Actions -->
<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
	<!-- Row 1: Page Title and Back Button (Handled by PageTitle component) -->
	<PageTitle name="Media Gallery" icon="bi:images" showBackButton={true} />

	<!-- Row 2 (on mobile): Save and Reset Buttons -->
	<div class="lgd:mt-0 mt-2 flex items-center justify-center gap-4 lg:justify-end">
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

<!-- Breadcrumb Navigation -->
<Breadcrumb {breadcrumb} {folders} {openFolder} />

<!-- <Filter {globalSearchValue} {selectedMediaType} {mediaTypes} /> -->

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
