<!-- 
@file src/routes/(app)/mediagallery/+page.svelte 
@component 
**This page is used to display the media gallery page**

This page displays a collection of media files, such as images, documents, audio, and video.
It p			if (result.success) {
				// Refetch all folders
				allSystemVirtualFolders = await fetchUpdatedSystemVirtualFolders();
				// Update current view
				const parent = currentSystemVirtualFolder?._id ?? null;
				systemVirtualFolders = allSystemVirtualFolders.filter((f) => f.parentId === parent);
				
				// Dispatch event to notify Collections component
				const event = new CustomEvent('folderCreated', {
					detail: { 
						folder: result.folder,
						parentId: parentId
					}
				});
				document.dispatchEvent(event);
				
				toastStore.trigger({
					message: 'Folder created successfully!',
					background: 'variant-filled-success',
					timeout: 3000
				});
			} else {er-friendly interface for searching, filtering, and navigating through media files.

### Props:
- `mediaType` {MediaTypeEnum} - The type of media files to display.
- `media` {MediaBase[]} - An array of media files to be displayed.

### Events:
- `mediaDeleted` - Emitted when a media file is deleted.	

### Features:
- Displays a collection of media files based on the specified media type.
- Provides a user-friendly interface for searching, filtering, and navigating through media files.
- Emits the `mediaDeleted` event when a media file is deleted.
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import axios from 'axios';

	// Stores
	import { mode } from '@src/stores/collectionStore.svelte';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';
	import { toggleUIElement } from '@src/stores/UIStore.svelte';

	// Utils & Media
	import { config, toFormData } from '@utils/utils';
	import { MediaTypeEnum, type MediaImage, type MediaBase } from '@utils/media/mediaModels';
	import { publicEnv } from '@root/config/public';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import Breadcrumb from '@components/Breadcrumb.svelte';
	import MediaGrid from './MediaGrid.svelte';
	import MediaTable from './MediaTable.svelte';

	// Skeleton
	import { getToastStore, getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Loading state
	let isLoading = $state(false);

	// Import types
	import type { SystemVirtualFolder } from '@src/databases/dbInterface';

	// Props using runes
	const { data = { user: undefined, media: [], virtualFolders: [] } } = $props<{
		data?: {
			user: { _id: string; email: string; role: string } | undefined;
			media: MediaBase[];
			systemVirtualFolders: SystemVirtualFolder[];
			currentFolder: SystemVirtualFolder | null; // Add currentFolder from load data
		};
	}>();

	// State using runes
	let files = $state<MediaImage[]>([]);
	let allSystemVirtualFolders = $state<SystemVirtualFolder[]>([]);
	let systemVirtualFolders = $state<SystemVirtualFolder[]>([]);
	let currentSystemVirtualFolder = $state<SystemVirtualFolder | null>(null);
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

	// Computed value for filtered files based on search and type
	let filteredFiles = $derived(
		files.filter((file) => {
			if (file.type === MediaTypeEnum.Image) {
				return (
					(file.filename || '').toLowerCase().includes(globalSearchValue.toLowerCase()) &&
					(selectedMediaType === 'All' || file.type === selectedMediaType)
				);
			} else {
				return (
					(file.filename || '').toLowerCase().includes(globalSearchValue.toLowerCase()) &&
					(selectedMediaType === 'All' || file.type === selectedMediaType)
				);
			}
		})
	);

	// Computed folders for breadcrumb - create a mapping of breadcrumb paths to folder IDs
	let breadcrumbFolders = $derived(() => {
		if (!currentSystemVirtualFolder) return [];

		const folders: { _id: string; name: string; path: string[] }[] = [];
		let current: SystemVirtualFolder | null = currentSystemVirtualFolder;
		const pathSegments: string[] = [];

		while (current) {
			pathSegments.unshift(current.name);
			folders.unshift({
				_id: current._id,
				name: current.name,
				path: [...pathSegments] // Copy the current path
			});
			// Find the parent folder
			current = allSystemVirtualFolders.find((f) => f._id === current?.parentId) || null;
		}

		return folders;
	});

	// Handle user preferences
	function storeUserPreference(view: 'grid' | 'table', gridSize: 'small' | 'medium' | 'large', tableSize: 'small' | 'medium' | 'large') {
		localStorage.setItem('GalleryUserPreference', `${view}/${gridSize}/${tableSize}`);
	}

	function getUserPreferenceFromLocalStorageOrCookie(): string | null {
		return localStorage.getItem('GalleryUserPreference');
	}

	// Mobile navigation helper
	function handleMobileNavigation(path: string) {
		// Hide sidebar on mobile before navigation
		if (typeof window !== 'undefined' && window.innerWidth < 768) {
			console.log('Mobile detected, hiding sidebar before navigation to:', path);
			toggleUIElement('leftSidebar', 'hidden');
		}
		goto(path);
	}

	// Initialize component with runes
	$effect(() => {
		mode.set('media');

		if (data && data.systemVirtualFolders) {
			systemVirtualFolders = data.systemVirtualFolders.map((folder: SystemVirtualFolder) => ({
				...folder,
				path: Array.isArray(folder.path) ? folder.path : folder.path?.split('/')
			}));
		}

		// Fetch all folders for navigation and breadcrumbs
		fetchUpdatedSystemVirtualFolders()
			.then((all) => {
				allSystemVirtualFolders = all;
				// If we are at the root, update `folders` to be the top-level folders from the full list.
				if (!currentSystemVirtualFolder) {
					systemVirtualFolders = allSystemVirtualFolders.filter((f) => !f.parentId);
				}
			})
			.catch((error) => {
				console.error('Failed to load virtual folders in effect:', error);
				// Use fallback data from server load if available
				if (data && data.systemVirtualFolders) {
					allSystemVirtualFolders = data.systemVirtualFolders.map((folder: SystemVirtualFolder) => ({
						...folder,
						path: Array.isArray(folder.path) ? folder.path : folder.path?.split('/')
					}));
					if (!currentSystemVirtualFolder) {
						systemVirtualFolders = allSystemVirtualFolders.filter((f) => !f.parentId);
					}
				}
			});

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

		// Listen for folder selection events from the Collections sidebar
		const handleSystemVirtualFolderSelected = (event: CustomEvent) => {
			console.log('System virtual folder selected event received:', event.detail);
			const { folderId } = event.detail;
			if (folderId && folderId !== 'root') {
				openSystemVirtualFolder(folderId);
			} else {
				openSystemVirtualFolder(null); // Navigate to root
			}
		};

		document.addEventListener('systemVirtualFolderSelected', handleSystemVirtualFolderSelected as EventListener);

		return () => {
			document.removeEventListener('systemVirtualFolderSelected', handleSystemVirtualFolderSelected as EventListener);
		};
	});
	// Function to update breadcrumb based on current folder
	function updateBreadcrumb() {
		if (!currentSystemVirtualFolder) {
			breadcrumb = [];
			return;
		}

		// Build breadcrumb by traversing up the parent hierarchy
		const buildBreadcrumb = (folder: SystemVirtualFolder): string[] => {
			const path: string[] = [];
			let current: SystemVirtualFolder | null = folder;

			while (current) {
				path.unshift(current.name); // Add folder name to the beginning
				// Find the parent folder
				current = allSystemVirtualFolders.find((f) => f._id === current?.parentId) || null;
			}

			return path;
		};

		breadcrumb = buildBreadcrumb(currentSystemVirtualFolder);
	}

	// Create a new folder with memoization
	async function createSystemVirtualFolder(folderName: string) {
		console.log('createSystemVirtualFolder called with:', folderName);

		// Validate folder name
		if (!folderName.trim()) {
			toastStore.trigger({
				message: 'Folder name cannot be empty',
				background: 'variant-filled-error',
				timeout: 3000
			});
			return;
		}

		// Check for invalid characters
		if (/[\\/:"*?<>|]/.test(folderName)) {
			toastStore.trigger({
				message: 'Folder name contains invalid characters (\\ / : * ? " < > |)',
				background: 'variant-filled-error',
				timeout: 3000
			});
			return;
		}

		// Check length
		if (folderName.length > 50) {
			toastStore.trigger({
				message: 'Folder name must be 50 characters or less',
				background: 'variant-filled-error',
				timeout: 3000
			});
			return;
		}

		isLoading = true;
		globalLoadingStore.startLoading(loadingOperations.dataFetch);
		try {
			const parentId = currentSystemVirtualFolder?._id ?? null;
			const requestBody = {
				name: folderName.trim(),
				parentId: parentId
			};
			console.log('Sending request with body:', requestBody);

			const response = await fetch('/api/systemVirtualFolder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(requestBody)
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
			}

			const result = await response.json();

			if (result.success) {
				// Refetch all folders
				allSystemVirtualFolders = await fetchUpdatedSystemVirtualFolders();
				// Update current view
				const parent = currentSystemVirtualFolder?._id ?? null;
				systemVirtualFolders = allSystemVirtualFolders.filter((f) => f.parentId === parent);

				// Dispatch event to notify Collections component
				const event = new CustomEvent('folderCreated', {
					detail: {
						folder: result.folder,
						parentId: parent
					}
				});
				document.dispatchEvent(event);
				console.log('Folder created event dispatched:', event.detail);

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
			let errorMessage = 'Failed to create folder';
			if (error instanceof Error) {
				if (error.message.includes('duplicate')) {
					errorMessage = error.message;
				} else if (error.message.includes('invalid')) {
					errorMessage = 'Invalid folder name';
				}
			}
			toastStore.trigger({
				message: errorMessage,
				background: 'variant-filled-error',
				timeout: 5000 // Longer timeout for errors
			});
		} finally {
			isLoading = false;
			globalLoadingStore.stopLoading(loadingOperations.dataFetch);
		}
	}

	// Fetch updated folders
	async function fetchUpdatedSystemVirtualFolders() {
		try {
			const response = await fetch('/api/systemVirtualFolder');
			const result = await response.json();

			if (result.success) {
				return result.data.map((folder: SystemVirtualFolder) => ({
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

	// Memoized fetch for media files
	let lastSystemFolderId = $state<string | null>(null);
	async function fetchMediaFiles() {
		const folderId = currentSystemVirtualFolder ? currentSystemVirtualFolder._id : 'root';

		// Skip if already loading or same folder
		if (isLoading || folderId === lastSystemFolderId) return;

		isLoading = true;
		globalLoadingStore.startLoading(loadingOperations.dataFetch);
		lastSystemFolderId = folderId;

		try {
			const { data } = await axios.get(`/api/systemVirtualFolder/${folderId}`, {
				timeout: 10000 // 10 second timeout
			});

			if (data.success) {
				files = Array.isArray(data.data.contents?.files) ? data.data.contents.files : [];
				systemVirtualFolders = Array.isArray(data.data.contents?.folders) ? data.data.contents.folders : [];
			} else {
				throw new Error(data.error || 'Unknown error');
			}
		} catch (error: unknown) {
			console.error('Error fetching media files:', error);
			let errorMessage = 'Failed to load media';
			if (error instanceof Error) {
				if (error.message.includes('timeout')) {
					errorMessage = 'Request timed out - please try again';
				} else if (error.message.includes('network')) {
					errorMessage = 'Network error - please check your connection';
				}
			}
			toastStore.trigger({
				message: errorMessage,
				background: 'variant-filled-error',
				timeout: 5000
			});
			files = [];
			systemVirtualFolders = [];
		} finally {
			isLoading = false;
			globalLoadingStore.stopLoading(loadingOperations.dataFetch);
		}
	}

	// Open virtual folder
	async function openSystemVirtualFolder(folderId: string | null) {
		try {
			if (folderId === null) {
				currentSystemVirtualFolder = null;
			} else {
				// Set current folder to the selected one from allFolders
				currentSystemVirtualFolder = allSystemVirtualFolders.find((f) => f._id === folderId) || null;
			}

			// Update breadcrumb based on the current folder
			updateBreadcrumb();

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

	// Open add virtual folder modal
	function openAddFolderModal() {
		// Default to MEDIA_FOLDER, which should represent the root directory
		let currentFolderPath = publicEnv.MEDIA_FOLDER;

		// Check if the currentFolder is set (i.e., the user is in a subfolder)
		if (currentSystemVirtualFolder) {
			currentFolderPath = Array.isArray(currentSystemVirtualFolder.path)
				? currentSystemVirtualFolder.path.join('/')
				: currentSystemVirtualFolder.path;
		}

		const modal: ModalSettings = {
			type: 'prompt',
			title: 'Add Folder',
			// Apply inline style or use a CSS class to make the current folder path display in a different color
			body: `Creating subfolder in: <span class="text-tertiary-500 dark:text-primary-500">${currentFolderPath}</span>`, // Display the current folder path in a different color
			response: (r: string) => {
				if (r) createSystemVirtualFolder(r); // Pass the new folder name to createFolder function
			}
		};

		modalStore.trigger(modal); // Trigger the modal to open
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
					message: 'Media deleted successfully.',
					background: 'variant-filled-success',
					timeout: 3000
				});
				await fetchMediaFiles();
			} else {
				throw new Error(result.error || 'Failed to delete media');
			}
		} catch (error) {
			console.error('Error deleting media: ', error);
			toastStore.trigger({
				message: 'Error deleting media',
				background: 'variant-filled-error',
				timeout: 3000
			});
		}
	}

	$effect(() => {
		// Log when the media data from the server changes
		console.log('Media files updated:', data.media);
	});
</script>

<!-- Page Title and Actions -->
<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
	<!-- Row 1: Page Title and Back Button (Handled by PageTitle component) -->
	<PageTitle
		name="Media Gallery"
		icon="bi:images"
		showBackButton={true}
		backUrl="/"
		onBackClick={(defaultBehavior) => {
			// Custom back navigation with loading state management
			try {
				defaultBehavior();
			} catch (error) {
				console.error('Navigation error:', error);
				// Fallback to home page if history.back() fails
				goto('/');
			}
		}}
	/>

	<!-- Row 2: Action Buttons -->
	<div class="lgd:mt-0 flex items-center justify-center gap-4 lg:justify-end">
		<!-- Add folder with loading state -->
		<button onclick={openAddFolderModal} aria-label="Add folder" class="variant-filled-tertiary btn gap-2" disabled={isLoading} aria-busy={isLoading}>
			<iconify-icon icon="mdi:folder-add-outline" width="24"></iconify-icon>
			{isLoading ? 'Creating...' : 'Add folder'}
			{#if isLoading}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
		</button>

		<!-- Add Media -->
		<button onclick={() => handleMobileNavigation('/mediagallery/uploadMedia')} aria-label="Add Media" class="variant-filled-primary btn gap-2">
			<iconify-icon icon="carbon:add-filled" width="24"></iconify-icon>
			Add Media
		</button>
	</div>
</div>

<!-- Breadcrumb Navigation -->
<Breadcrumb {breadcrumb} folders={breadcrumbFolders} openFolder={openSystemVirtualFolder} />

<div class="wrapper overflow-auto">
	<div class="mb-8 flex w-full flex-col justify-center gap-1 md:hidden">
		<label for="globalSearch">Search</label>
		<div class="input-group input-group-divider grid max-w-md grid-cols-[auto_1fr_auto]">
			<input id="globalSearch" type="text" placeholder="Search Media" class="input" bind:value={globalSearchValue} />
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
							<button onclick={() => handleViewChange('table')} aria-label="Table" class="btn flex flex-col items-center justify-center px-1">
								<p class="text-center text-xs">Display</p>
								<iconify-icon icon="material-symbols:list-alt-outline" height="44" style={`color: text-black dark:text-white`}></iconify-icon>
								<p class="text-xs">Table</p>
							</button>
						{:else}
							<button onclick={() => handleViewChange('grid')} aria-label="Grid" class="btn flex flex-col items-center justify-center px-1">
								<p class="text-center text-xs">Display</p>
								<iconify-icon icon="material-symbols:grid-view-rounded" height="42" style={`color: text-black dark:text-white`}></iconify-icon>
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
								onclick={() => {
									const newSize =
										view === 'grid'
											? gridSize === 'small'
												? 'medium'
												: gridSize === 'medium'
													? 'large'
													: 'small'
											: tableSize === 'small'
												? 'medium'
												: tableSize === 'medium'
													? 'large'
													: 'small';

									if (view === 'grid') {
										gridSize = newSize;
									} else {
										tableSize = newSize;
									}
									storeUserPreference(view, gridSize, tableSize);
								}}
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
								onclick={() => {
									const newSize =
										view === 'grid'
											? gridSize === 'small'
												? 'medium'
												: gridSize === 'medium'
													? 'large'
													: 'small'
											: tableSize === 'small'
												? 'medium'
												: tableSize === 'medium'
													? 'large'
													: 'small';

									if (view === 'grid') {
										gridSize = newSize;
									} else {
										tableSize = newSize;
									}
									storeUserPreference(view, gridSize, tableSize);
								}}
								type="button"
								aria-label="Medium"
								class="px-1"
							>
								<iconify-icon icon="material-symbols:grid-on-sharp" height="40" style={`color: text-black dark:text-white`}></iconify-icon>
								<p class="text-xs">Medium</p>
							</button>
						{:else}
							<button
								onclick={() => {
									const newSize =
										view === 'grid'
											? gridSize === 'small'
												? 'medium'
												: gridSize === 'medium'
													? 'large'
													: 'small'
											: tableSize === 'small'
												? 'medium'
												: tableSize === 'medium'
													? 'large'
													: 'small';

									if (view === 'grid') {
										gridSize = newSize;
									} else {
										tableSize = newSize;
									}
									storeUserPreference(view, gridSize, tableSize);
								}}
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
							onclick={() => {
								const newSize =
									view === 'grid'
										? gridSize === 'small'
											? 'medium'
											: gridSize === 'medium'
												? 'large'
												: 'small'
										: tableSize === 'small'
											? 'medium'
											: tableSize === 'medium'
												? 'large'
												: 'small';

								if (view === 'grid') {
									gridSize = newSize;
								} else {
									tableSize = newSize;
								}
								storeUserPreference(view, gridSize, tableSize);
							}}
							type="button"
							class="px-1 md:px-2"
							aria-label="Small"
						>
							<iconify-icon icon="material-symbols:background-grid-small-sharp" height="40"></iconify-icon>
							<br /><span class="text-tertiary-500 dark:text-primary-500">Small</span>
						</button>
					{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
						<button
							onclick={() => {
								const newSize =
									view === 'grid'
										? gridSize === 'small'
											? 'medium'
											: gridSize === 'medium'
												? 'large'
												: 'small'
										: tableSize === 'small'
											? 'medium'
											: tableSize === 'medium'
												? 'large'
												: 'small';

								if (view === 'grid') {
									gridSize = newSize;
								} else {
									tableSize = newSize;
								}
								storeUserPreference(view, gridSize, tableSize);
							}}
							type="button"
							class="px-1 md:px-2"
							aria-label="Medium"
						>
							<iconify-icon icon="material-symbols:grid-on-sharp" height="40"></iconify-icon>
							<br /><span class="text-tertiary-500 dark:text-primary-500">Medium</span>
						</button>
					{:else}
						<button
							onclick={() => {
								const newSize =
									view === 'grid'
										? gridSize === 'small'
											? 'medium'
											: gridSize === 'medium'
												? 'large'
												: 'small'
										: tableSize === 'small'
											? 'medium'
											: tableSize === 'medium'
												? 'large'
												: 'small';

								if (view === 'grid') {
									gridSize = newSize;
								} else {
									tableSize = newSize;
								}
								storeUserPreference(view, gridSize, tableSize);
							}}
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
		<MediaGrid
			{filteredFiles}
			{gridSize}
			ondeleteImage={handleDeleteImage}
			on:sizechange={({ detail }) => {
				if (detail.type === 'grid') {
					gridSize = detail.size;
					storeUserPreference(view, gridSize, tableSize);
				}
			}}
		/>
	{:else}
		<MediaTable {filteredFiles} {tableSize} ondeleteImage={handleDeleteImage} />
	{/if}
</div>
