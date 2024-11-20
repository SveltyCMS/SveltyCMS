<!-- 
@file src/routes/(app)/mediagallery/+page.svelte 
@component 
**This page is used to display the media gallery page**

This page displays a collection of media files, such as images, documents, audio, and video.
It provides a user-friendly interface for searching, filtering, and navigating through media files.

Features:
- Search for media files
- Filter media files by type
- Navigate through media files

-->

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import axios from 'axios';

	// Stores
	import { mode } from '@root/src/stores/collectionStore.svelte';

	// Utils & Media
	import { config, toFormData, SIZES } from '@utils/utils';
	import { MediaTypeEnum, type MediaImage, type MediaType, type MediaBase } from '@utils/media/mediaModels';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import Breadcrumb from '@components/Breadcrumb.svelte';
	import MediaGrid from './MediaGrid.svelte';
	import MediaTable from './MediaTable.svelte';

	// Skeleton
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings } from '@skeletonlabs/skeleton';

	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// System Logger
	import { logger } from '@src/utils/logger';

	// Props using runes
	const { data = { user: undefined, media: [], virtualFolders: [] } } = $props<{
		data?: { user: any; media: any[]; virtualFolders: any[] };
	}>();

	// State using runes
	let files = $state<MediaImage[]>([]);
	let folders = $state<{ _id: string; name: string; path: string[]; parent?: string | null }[]>([]);
	let currentFolder = $state<{ _id: string; name: string; path: string[] } | null>(null);
	let breadcrumb = $state<string[]>([]);

	let globalSearchValue = $state('');
	let selectedMediaType = $state<'All' | MediaTypeEnum>('All');
	let view = $state<'grid' | 'table'>('grid');
	let gridSize = $state<'small' | 'medium' | 'large'>('small');
	let tableSize = $state<'small' | 'medium' | 'large'>('small');

	type MediaTypeOption = {
		value: 'All' | MediaTypeEnum;
		label: string;
	};

	// Media types with proper typing
	const mediaTypes: MediaTypeOption[] = [
		{ value: 'All', label: 'ALL' },
		{ value: MediaTypeEnum.Image, label: 'IMAGE' },
		{ value: MediaTypeEnum.Document, label: 'DOCUMENT' },
		{ value: MediaTypeEnum.Audio, label: 'AUDIO' },
		{ value: MediaTypeEnum.Video, label: 'VIDEO' },
		{ value: MediaTypeEnum.RemoteVideo, label: 'REMOTE VIDEO' }
	];

	// Computed value for filtered files
	let filteredFiles = $derived(
		files.filter((file) => {
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
		})
	);

	onMount(() => {
		mode.set('media');
		console.log('Received data:', data);

		if (data && data.virtualFolders) {
			folders = data.virtualFolders.map((folder) => ({
				...folder,
				path: Array.isArray(folder.path) ? folder.path : folder?.path?.split('/')
			}));
			console.log('Processed folders:', folders);
		} else {
			console.error('Virtual folders data is missing or in unexpected format');
			folders = [];

			toastStore.trigger({
				message: 'Error loading folder structure',
				background: 'variant-filled-error',
				timeout: 3000
			});
		}

		fetchMediaFiles();
		updateBreadcrumb();

		// Initialize user preferences
		const userPreference = getUserPreferenceFromLocalStorageOrCookie();
		if (userPreference) {
			const [preferredView, preferredGridSize, preferredTableSize] = userPreference?.split('/');
			view = preferredView as 'grid' | 'table';
			gridSize = preferredGridSize as 'small' | 'medium' | 'large';
			tableSize = preferredTableSize as 'small' | 'medium' | 'large';
		}
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
				throw Error(result.error);
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

			const { data } = await axios.get(`/api/virtualFolder/${folderId}`);
			if (data.success) {
				// Ensure mediaFiles is always an array
				files = Array.isArray(data.contents?.mediaFiles) ? data.contents.mediaFiles : [];
				console.log('Fetched media files:', files);
			} else {
				const errorMessage = data.error || 'Unknown error';
				console.error('Error in response:', errorMessage);
				throw new Error(errorMessage);
			}
		} catch (error: unknown) {
			console.error(`Error fetching media files:`, error);
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			toastStore.trigger({
				message: errorMessage,
				background: 'variant-filled-error',
				timeout: 3000
			});
			files = [];
			folders = [];
		}
	}

	// Create virtual folder with existence check
	async function createFolder(name: string) {
		try {
			const parentFolder = currentFolder ? folders.find((f) => f._id === currentFolder?._id) : null;
			const newPath = parentFolder ? `${parentFolder.path.join('/')}/${name}` : `${publicEnv.MEDIA_FOLDER}/${name}`;

			// Check if the folder already exists
			logger.debug(`Checking if folder exists: ${newPath}  currentFolder:`, folders);
			const existingFolder = folders.find((folder) => folder?.path?.join('/') === newPath);
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
				throw Error(result.error);
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
					path: Array.isArray(folder.path) ? folder.path : folder?.path?.split('/') // Ensure path is always an array
				}));
				console.log('Updated folders:', updatedFolders);
				return updatedFolders;
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
				throw Error(result.error);
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
		if (currentFolder && currentFolder.path) {
			breadcrumb = [publicEnv.MEDIA_FOLDER, ...currentFolder.path.slice(1)];
		} else {
			breadcrumb = [publicEnv.MEDIA_FOLDER];
		}
		console.log('Updated breadcrumb:', breadcrumb);
	}

	// Handle delete image
	async function handleDeleteImage(file: MediaBase) {
		try {
			const q = toFormData({ method: 'POST', image: file._id ?? '' });
			const response = await axios.post('?/api/mediaHandler/', q, {
				...config,
				withCredentials: true // This ensures cookies are sent with the request
			});
			const result = response.data;
			if (result?.success) {
				toastStore.trigger({
					message: 'Image deleted successfully.',
					background: 'variant-filled-success',
					timeout: 3000
				});
				await fetchMediaFiles();
			} else {
				throw new Error(result.error || 'Failed to delete image');
			}
		} catch (error) {
			console.error('Error deleting image: ', error);
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

	// Handle view change
	function handleClick() {
		if (view === 'grid') {
			gridSize = gridSize === 'small' ? 'medium' : gridSize === 'medium' ? 'large' : 'small';
		} else {
			tableSize = tableSize === 'small' ? 'medium' : tableSize === 'medium' ? 'large' : 'small';
		}
		storeUserPreference(view, gridSize, tableSize);
	}

	// Event handlers
	function handleViewChange(newView: 'grid' | 'table') {
		view = newView;
		storeUserPreference(view, gridSize, tableSize);
	}

	function clearSearch() {
		globalSearchValue = '';
	}
</script>

<!-- Page Title and Actions -->
<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
	<!-- Row 1: Page Title and Back Button (Handled by PageTitle component) -->
	<PageTitle name="Media Gallery" icon="bi:images" showBackButton={true} />

	<!-- Row 2 (on mobile): Save and Reset Buttons -->
	<div class="lgd:mt-0 flex items-center justify-center gap-4 lg:justify-end">
		<!-- Add folder -->
		<button onclick={openAddFolderModal} aria-label="Add folder" class="variant-filled-tertiary btn gap-2">
			<iconify-icon icon="mdi:folder-add-outline" width="24"></iconify-icon>
			Add folder
		</button>

		<!-- Add Media -->
		<button onclick={() => goto('/mediagallery/uploadMedia')} aria-label="Add Media" class="variant-filled-primary btn gap-2">
			<iconify-icon icon="carbon:add-filled" width="24"></iconify-icon>
			Add Media
		</button>
	</div>
</div>

<!-- Breadcrumb Navigation -->
<Breadcrumb {breadcrumb} {folders} {openFolder} />

<div class="wrapper overflow-auto">
	<div class="mb-8 flex w-full flex-col justify-center gap-1 md:hidden">
		<label for="globalSearch">Search</label>
		<div class="input-group input-group-divider grid max-w-md grid-cols-[auto_1fr_auto]">
			<input id="globalSearch" type="text" placeholder="Search" class="input" bind:value={globalSearchValue} />
			{#if globalSearchValue}
				<button onclick={() => (globalSearchValue = '')} aria-label="Clear search" class="variant-filled-surface w-12">
					<iconify-icon icon="ic:outline-search-off" width="24"></iconify-icon>
				</button>
			{/if}
		</div>

		<div class="mt-4 flex justify-between">
			<div class="flex flex-col">
				<label for="mediaType">Type</label>
				<select id="mediaType" bind:value={selectedMediaType} class="input">
					{#each mediaTypes as type}
						<option value={type.value}>{type.label}</option>
					{/each}
				</select>
			</div>

			<div class="flex flex-col text-center">
				<label for="sortButton">Sort</label>
				<button id="sortButton" aria-label="Sort" class="variant-ghost-surface btn">
					<iconify-icon icon="flowbite:sort-outline" width="24"></iconify-icon>
				</button>
			</div>

			<div class="flex items-center justify-center text-center text-xs md:hidden">
				<div class="flex flex-col items-center justify-center">
					<div class="flex sm:divide-x sm:divide-gray-500">
						{#if view === 'grid'}
							<button onclick={() => handleViewChange('table')} aria-label="table" class="btn flex flex-col items-center justify-center px-1">
								<p class="text-center text-xs">Display</p>
								<iconify-icon icon="material-symbols:grid-view-rounded" height="42" style={`color: text-black dark:text-white`}></iconify-icon>
								<p class="text-xs">Table</p>
							</button>
						{:else}
							<button onclick={() => handleViewChange('grid')} aria-label="Grid" class="btn flex flex-col items-center justify-center px-1">
								<p class="text-center text-xs">Display</p>
								<iconify-icon icon="material-symbols:list-alt-outline" height="44" style={`color: text-black dark:text-white`}></iconify-icon>
								<p class="text-center text-xs">Grid</p>
							</button>
						{/if}
					</div>
				</div>
				<div class="flex flex-col items-center">
					<p class="text-xs">Size</p>
					<div class="divide-surface-00 flex divide-x">
						{#if (view === 'grid' && gridSize === 'small') || (view === 'table' && tableSize === 'small')}
							<button onclick={handleClick} type="button" aria-label="Small" class="px-1">
								<iconify-icon icon="material-symbols:background-grid-small-sharp" height="40" style={`color:text-black dark:text-white`}
								></iconify-icon>
								<p class="text-xs">Small</p>
							</button>
						{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
							<button onclick={handleClick} type="button" aria-label="Medium" class="px-1">
								<iconify-icon icon="material-symbols:grid-on-sharp" height="40" style={`color: text-black dark:text-white`}></iconify-icon>
								<p class="text-xs">Medium</p>
							</button>
						{:else}
							<button onclick={handleClick} type="button" aria-label="Large" class="px-1">
								<iconify-icon icon="material-symbols:grid-view" height="40" style={`color: text-black dark:text-white`}></iconify-icon>
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
				<input bind:value={globalSearchValue} id="globalSearchMd" type="text" placeholder="Search" class="input" />
				{#if globalSearchValue}
					<button onclick={clearSearch} class="variant-filled-surface w-12" aria-label="Clear search">
						<iconify-icon icon="ic:outline-search-off" width="24"></iconify-icon>
					</button>
				{/if}
			</div>
		</div>

		<div class="mb-8 flex flex-col justify-center gap-1">
			<label for="mediaTypeMd">Type</label>
			<div class="input-group">
				<select id="mediaTypeMd" bind:value={selectedMediaType}>
					{#each mediaTypes as type}
						<option value={type.value}>{type.label}</option>
					{/each}
				</select>
			</div>
		</div>

		<div class="mb-8 flex flex-col justify-center gap-1 text-center">
			<label for="sortButton">Sort</label>
			<button id="sortButton" class="variant-ghost-surface btn" aria-label="Sort">
				<iconify-icon icon="flowbite:sort-outline" width="24"></iconify-icon>
			</button>
		</div>

		<div class="flex items-center justify-center gap-4">
			<div class="hidden flex-col items-center sm:flex">
				Display
				<div class="flex divide-x divide-gray-500">
					<button onclick={() => handleViewChange('grid')} class="px-2" aria-label="Grid">
						<iconify-icon icon="material-symbols:grid-view-rounded" height="40" style={`color: ${view === 'grid' ? 'black dark:white' : 'grey'}`}
						></iconify-icon>
						<br /> <span class="text-tertiary-500 dark:text-primary-500">Grid</span>
					</button>
					<button onclick={() => handleViewChange('table')} class="px-2" aria-label="Table">
						<iconify-icon icon="material-symbols:list-alt-outline" height="40" style={`color: ${view === 'table' ? 'black dark:white' : 'grey'}`}
						></iconify-icon>
						<br /><span class="text-tertiary-500 dark:text-primary-500">Table</span>
					</button>
				</div>
			</div>

			<div class="hidden flex-col items-center sm:flex">
				Size
				<div class="flex divide-x divide-gray-500">
					{#if (view === 'grid' && gridSize === 'small') || (view === 'table' && tableSize === 'small')}
						<button onclick={handleClick} type="button" class="px-1 md:px-2" aria-label="Small">
							<iconify-icon icon="material-symbols:background-grid-small-sharp" height="40"></iconify-icon>
							<br /><span class="text-tertiary-500 dark:text-primary-500">Small</span>
						</button>
					{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
						<button onclick={handleClick} type="button" class="px-1 md:px-2" aria-label="Medium">
							<iconify-icon icon="material-symbols:grid-on-sharp" height="40"></iconify-icon>
							<br /><span class="text-tertiary-500 dark:text-primary-500">Medium</span>
						</button>
					{:else}
						<button onclick={handleClick} type="button" class="px-1 md:px-2" aria-label="Large">
							<iconify-icon icon="material-symbols:grid-view" height="40"></iconify-icon>
							<br /><span class="text-tertiary-500 dark:text-primary-500">Large</span>
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>

	{#if view === 'grid'}
		<MediaGrid {filteredFiles} {gridSize} ondeleteImage={handleDeleteImage} />
	{:else}
		<MediaTable {filteredFiles} {tableSize} ondeleteImage={handleDeleteImage} />
	{/if}
</div>
