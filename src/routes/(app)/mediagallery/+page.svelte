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
	import { goto } from '$app/navigation';
	import axios from 'axios';

	// Stores
	import { mode } from '@src/stores/collectionStore.svelte';

	// Utils & Media
	import { config, toFormData } from '@utils/utils';
	import { MediaTypeEnum, type MediaImage, type MediaBase } from '@utils/media/mediaModels';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import Breadcrumb from '@components/Breadcrumb.svelte';
	import MediaGrid from './MediaGrid.svelte';
	import MediaTable from './MediaTable.svelte';

	// Skeleton
	import { getToastStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();

	// Types
	interface VirtualFolder {
		_id: string;
		name: string;
		path: string[] | string;
		parent?: string | null;
	}

	type Folder = {
		_id: string;
		name: string;
		path: string[];
	};

	// Props using runes
	const { data = { user: undefined, media: [], virtualFolders: [] } } = $props<{
		data?: {
			user: { _id: string; email: string; role: string } | undefined;
			media: MediaBase[];
			virtualFolders: VirtualFolder[];
		};
	}>();

	// State using runes
	let files = $state<MediaImage[]>([]);
	let folders = $state<VirtualFolder[]>([]);
	let currentFolder = $state<VirtualFolder | null>(null);
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
				return (
					(file.name || '').toLowerCase().includes(globalSearchValue.toLowerCase()) &&
					(selectedMediaType === 'All' || file.type === selectedMediaType)
				);
			} else {
				return (
					(file.name || '').toLowerCase().includes(globalSearchValue.toLowerCase()) &&
					(selectedMediaType === 'All' || file.type === selectedMediaType)
				);
			}
		})
	);

	// Computed folders for breadcrumb
	let breadcrumbFolders = $derived(
		folders.map((folder) => ({
			_id: folder._id,
			name: folder.name,
			path: Array.isArray(folder.path) ? folder.path : folder.path.split('/')
		}))
	);

	// Handle user preferences
	function storeUserPreference(view: 'grid' | 'table', gridSize: 'small' | 'medium' | 'large', tableSize: 'small' | 'medium' | 'large') {
		localStorage.setItem('GalleryUserPreference', `${view}/${gridSize}/${tableSize}`);
	}

	function getUserPreferenceFromLocalStorageOrCookie(): string | null {
		return localStorage.getItem('GalleryUserPreference');
	}

	// Initialize component with runes
	$effect(() => {
		mode.set('media');
	

		if (data && data.virtualFolders) {
			folders = data.virtualFolders.map((folder: VirtualFolder) => ({
				...folder,
				path: Array.isArray(folder.path) ? folder.path : folder.path?.split('/')
			}));
		}

		if (data && data.media) {
			files = data.media;
		}

		// Load user preferences
		const userPreference = getUserPreferenceFromLocalStorageOrCookie();
		if (userPreference) {
			const [preferredView, preferredGridSize, preferredTableSize] = userPreference.split('/');
			view = preferredView as 'grid' | 'table';
			gridSize = preferredGridSize as 'small' | 'medium' | 'large';
			tableSize = preferredTableSize as 'small' | 'medium' | 'large';
		}
	});

	// Function to update breadcrumb based on current folder
	function updateBreadcrumb() {
		if (!currentFolder) {
			breadcrumb = [];
			return;
		}
		breadcrumb = Array.isArray(currentFolder.path) ? currentFolder.path : currentFolder.path.split('/');
	}

	// Create a new folder
	async function createFolder(folderName: string) {
		try {
			const parentId = currentFolder?._id ?? null;
			const response = await fetch('/api/virtualFolder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: folderName, parent: parentId })
			});

			const result = await response.json();

			if (result.success) {
				folders = await fetchUpdatedFolders();
				toastStore.trigger({
					message: 'Folder created successfully',
					background: 'variant-filled-success',
					timeout: 3000
				});
			} else {
				throw new Error(result.error || 'Failed to create folder');
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

	// Fetch updated folders
	async function fetchUpdatedFolders() {
		try {
			const response = await fetch('/api/virtualFolder');
			const result = await response.json();

			if (result.success) {
				return result.folders.map((folder: VirtualFolder) => ({
					...folder,
					path: Array.isArray(folder.path) ? folder.path : folder.path?.split('/')
				}));
			} else {
				throw new Error(result.error || 'Failed to fetch folders');
			}
		} catch (error) {
			console.error('Error fetching updated folders:', error);
			toastStore.trigger({
				message: 'Failed to fetch folders',
				background: 'variant-filled-error',
				timeout: 3000
			});
			return [];
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

	// Open virtual folder
	async function openFolder(folderId: string | null) {
		try {
			if (folderId === null) {
				// Navigate to root
				currentFolder = null;
			} else {
				// Set current folder to the selected one
				currentFolder = folders.find((f) => f._id === folderId) || null;
			}

			// Update breadcrumb based on the current folder
			updateBreadcrumb();

			// Fetch and display subfolders immediately after setting currentFolder
			if (currentFolder) {
				folders = await fetchUpdatedFolders();
			}

			// Fetch media files for the current folder
			await fetchMediaFiles();
		} catch (error) {
			console.error('Error opening folder:', error);
			toastStore.trigger({
				message: 'Failed to open folder',
				background: 'variant-filled-error',
				timeout: 3000
			});
		}
	}

	// Handle view change
	function handleViewChange(newView: 'grid' | 'table') {
		view = newView;
		storeUserPreference(view, gridSize, tableSize);
	}

	// Clear search
	function clearSearch() {
		globalSearchValue = '';
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
</script>

<!-- Page Title and Actions -->
<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
	<!-- Row 1: Page Title and Back Button (Handled by PageTitle component) -->
	<PageTitle name="Media Gallery" icon="bi:images" showBackButton={true} />

	<!-- Row 2 (on mobile): Save and Reset Buttons -->
	<div class="lgd:mt-0 flex items-center justify-center gap-4 lg:justify-end">
		<!-- Add folder -->
		<button onclick={() => createFolder('New Folder')} aria-label="Add folder" class="variant-filled-tertiary btn gap-2">
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
<Breadcrumb {breadcrumb} folders={breadcrumbFolders} {openFolder} />

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
							<button
								onclick={() => (gridSize = gridSize === 'small' ? 'medium' : gridSize === 'medium' ? 'large' : 'small')}
								type="button"
								aria-label="Small"
								class="px-1"
							>
								<iconify-icon icon="material-symbols:background-grid-small-sharp" height="40" style={`color:text-black dark:text-white`}
								></iconify-icon>
								<p class="text-xs">Small</p>
							</button>
						{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
							<button
								onclick={() => (gridSize = gridSize === 'small' ? 'medium' : gridSize === 'medium' ? 'large' : 'small')}
								type="button"
								aria-label="Medium"
								class="px-1"
							>
								<iconify-icon icon="material-symbols:grid-on-sharp" height="40" style={`color: text-black dark:text-white`}></iconify-icon>
								<p class="text-xs">Medium</p>
							</button>
						{:else}
							<button
								onclick={() => (gridSize = gridSize === 'small' ? 'medium' : gridSize === 'medium' ? 'large' : 'small')}
								type="button"
								aria-label="Large"
								class="px-1"
							>
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
						<button
							onclick={() => (gridSize = gridSize === 'small' ? 'medium' : gridSize === 'medium' ? 'large' : 'small')}
							type="button"
							class="px-1 md:px-2"
							aria-label="Small"
						>
							<iconify-icon icon="material-symbols:background-grid-small-sharp" height="40"></iconify-icon>
							<br /><span class="text-tertiary-500 dark:text-primary-500">Small</span>
						</button>
					{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
						<button
							onclick={() => (gridSize = gridSize === 'small' ? 'medium' : gridSize === 'medium' ? 'large' : 'small')}
							type="button"
							class="px-1 md:px-2"
							aria-label="Medium"
						>
							<iconify-icon icon="material-symbols:grid-on-sharp" height="40"></iconify-icon>
							<br /><span class="text-tertiary-500 dark:text-primary-500">Medium</span>
						</button>
					{:else}
						<button
							onclick={() => (gridSize = gridSize === 'small' ? 'medium' : gridSize === 'medium' ? 'large' : 'small')}
							type="button"
							class="px-1 md:px-2"
							aria-label="Large"
						>
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
