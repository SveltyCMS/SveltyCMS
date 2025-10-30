<!--
@file src/routes/(app)/mediagallery/+page.svelte
@component
**Media Gallery Page**

Displays a collection of media files (images, documents, audio, video) with:
- Virtual folder navigation and breadcrumb trails
- Search and filter by media type
- Grid and table view modes with size options
- Upload and folder management capabilities

### Props:
- `data.user` - Current user information
- `data.media` - Array of media files to display
- `data.systemVirtualFolders` - Virtual folder structure

### Features:
- Client-side search and filtering
- Responsive grid/table layouts
- Virtual folder CRUD operations
- Media file deletion
-->

<script lang="ts">
	import { goto } from '$app/navigation';
	import axios from 'axios';
	// Stores
	import { toggleUIElement } from '@src/stores/UIStore.svelte';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';
	// Utils & Media
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { MediaTypeEnum, type MediaBase, type MediaImage } from '@utils/media/mediaModels';
	// Components
	import Breadcrumb from '@components/Breadcrumb.svelte';
	import PageTitle from '@components/PageTitle.svelte';
	import MediaGrid from './MediaGrid.svelte';
	import MediaTable from './MediaTable.svelte';
	// Skeleton
	import { getModalStore, type ModalSettings } from '@skeletonlabs/skeleton';
	import { showToast } from '@utils/toast';
	// Import types
	import type { SystemVirtualFolder } from '@src/databases/dbInterface';

	// Initialize modal store
	const modalStore = getModalStore();

	// Props using runes
	const { data = { user: undefined, media: [], systemVirtualFolders: [], currentFolder: null } } = $props<{
		data?: {
			user: { _id: string; email: string; role: string } | undefined;
			media: MediaBase[];
			systemVirtualFolders: SystemVirtualFolder[];
			currentFolder: SystemVirtualFolder | null;
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
	let gridSize = $state<'tiny' | 'small' | 'medium' | 'large'>('small');
	let tableSize = $state<'tiny' | 'small' | 'medium' | 'large'>('small');
	let isLoading = $state(false);

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
			const matchesSearch = (file.filename || '').toLowerCase().includes(globalSearchValue.toLowerCase());
			const matchesType = selectedMediaType === 'All' || file.type === selectedMediaType;
			return matchesSearch && matchesType;
		})
	);

	// Computed folders for breadcrumb - create a mapping of breadcrumb paths to folder IDs
	let breadcrumbFolders = $derived.by(() => {
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
	function storeUserPreference(
		view: 'grid' | 'table',
		gridSize: 'tiny' | 'small' | 'medium' | 'large',
		tableSize: 'tiny' | 'small' | 'medium' | 'large'
	) {
		localStorage.setItem('GalleryUserPreference', `${view}/${gridSize}/${tableSize}`);
	}

	function getUserPreferenceFromLocalStorageOrCookie(): string | null {
		return localStorage.getItem('GalleryUserPreference');
	}

	// Mobile navigation helper - hides sidebar on mobile before navigation
	function handleMobileNavigation(path: string) {
		if (typeof window !== 'undefined' && window.innerWidth < 768) {
			toggleUIElement('leftSidebar', 'hidden');
		}
		goto(path);
	}

	// Computed safe table size (MediaTable doesn't support 'tiny')
	let safeTableSize = $derived<'small' | 'medium' | 'large'>(tableSize === 'tiny' ? 'small' : tableSize);

	// Initialize component with runes
	$effect(() => {
		// Note: Mode is now managed by Collections component based on route

		if (data && data.systemVirtualFolders) {
			// Process initial folder data from server
			allSystemVirtualFolders = data.systemVirtualFolders.map((folder: SystemVirtualFolder) => ({
				...folder,
				path: Array.isArray(folder.path) ? folder.path : folder.path?.split('/')
			}));
		}

		// Fetch all folders for navigation and breadcrumbs
		fetchUpdatedSystemVirtualFolders()
			.then((all) => {
				allSystemVirtualFolders = all;
			})
			.catch((error) => {
				console.error('Failed to load virtual folders in effect:', error);
				// Use fallback data from server load if available
				if (data && data.systemVirtualFolders) {
					allSystemVirtualFolders = data.systemVirtualFolders.map((folder: SystemVirtualFolder) => ({
						...folder,
						path: Array.isArray(folder.path) ? folder.path : folder.path?.split('/')
					}));
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
			gridSize = preferredGridSize as 'tiny' | 'small' | 'medium' | 'large';
			tableSize = preferredTableSize as 'tiny' | 'small' | 'medium' | 'large';
		}

		// Listen for folder selection events from the Collections sidebar
		const handleSystemVirtualFolderSelected = (event: CustomEvent) => {
			const { folderId } = event.detail;
			openSystemVirtualFolder(folderId && folderId !== 'root' ? folderId : null);
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

	// Create a new virtual folder with validation
	async function createSystemVirtualFolder(folderName: string) {
		// Validate folder name
		const trimmedName = folderName.trim();
		if (!trimmedName) {
			showToast('Folder name cannot be empty', 'error');
			return;
		}

		if (/[\\/:"*?<>|]/.test(trimmedName)) {
			showToast('Folder name contains invalid characters (\\ / : * ? " < > |)', 'error');
			return;
		}

		if (trimmedName.length > 50) {
			showToast('Folder name must be 50 characters or less', 'error');
			return;
		}

		isLoading = true;
		globalLoadingStore.startLoading(loadingOperations.dataFetch);

		try {
			const parentId = currentSystemVirtualFolder?._id ?? null;
			const response = await fetch('/api/systemVirtualFolder', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: trimmedName, parentId })
			});

			if (!response.ok) {
				const errorData = await response.json();
				throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
			}

			const result = await response.json();

			if (result.success) {
				// Refetch all folders and update current view
				allSystemVirtualFolders = await fetchUpdatedSystemVirtualFolders();
				systemVirtualFolders = allSystemVirtualFolders.filter((f) => f.parentId === parentId);

				// Notify Collections component
				document.dispatchEvent(
					new CustomEvent('folderCreated', {
						detail: { folder: result.folder, parentId }
					})
				);

				showToast('Folder created successfully', 'success');
			} else {
				throw new Error(result.error || 'Failed to create folder');
			}
		} catch (error) {
			console.error('Error creating folder:', error);
			const errorMessage =
				error instanceof Error && error.message.includes('duplicate')
					? error.message
					: error instanceof Error && error.message.includes('invalid')
						? 'Invalid folder name'
						: 'Failed to create folder';
			showToast(errorMessage, 'error');
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
			showToast('Failed to fetch folders', 'error');
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
				// Folders are handled by allSystemVirtualFolders
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
			showToast(errorMessage, 'error');
			files = [];
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
			showToast('Failed to open folder', 'error');
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
		const currentFolderPath = currentSystemVirtualFolder
			? Array.isArray(currentSystemVirtualFolder.path)
				? currentSystemVirtualFolder.path.join('/')
				: currentSystemVirtualFolder.path
			: publicEnv?.MEDIA_FOLDER || 'mediaFiles';
		const modal: ModalSettings = {
			type: 'prompt',
			title: 'Add Folder',
			body: `Creating subfolder in: <span class="text-tertiary-500 dark:text-primary-500">${currentFolderPath}</span>`,
			response: (r: string) => {
				if (r) createSystemVirtualFolder(r);
			}
		};

		modalStore.trigger(modal);
	}

	// Handle delete image
	async function handleDeleteImage(file: MediaBase) {
		try {
			const response = await fetch('?/deleteMedia', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({ image: file })
			});

			const result = await response.json();
			if (result?.success) {
				showToast('Media deleted successfully.', 'success');
				await fetchMediaFiles();
			} else {
				throw new Error(result.error || 'Failed to delete media');
			}
		} catch (error) {
			console.error('Error deleting media: ', error);
			showToast('Error deleting media', 'error');
		}
	}
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
								<iconify-icon icon="material-symbols:list-alt-outline" height="44" style="color: text-black dark:text-white"></iconify-icon>
								<p class="text-xs">Table</p>
							</button>
						{:else}
							<button onclick={() => handleViewChange('grid')} aria-label="Grid" class="btn flex flex-col items-center justify-center px-1">
								<p class="text-center text-xs">Display</p>
								<iconify-icon icon="material-symbols:grid-view-rounded" height="42" style="color: text-black dark:text-white"></iconify-icon>
								<p class="text-center text-xs">Grid</p>
							</button>
						{/if}
					</div>
				</div>
				<div class="flex flex-col items-center">
					<p class="text-xs">Size</p>
					<div class="divide-surface-00 flex divide-x">
						{#if (view === 'grid' && gridSize === 'tiny') || (view === 'table' && tableSize === 'tiny')}
							<button
								onclick={() => {
									const newSize =
										view === 'grid'
											? gridSize === 'tiny'
												? 'small'
												: gridSize === 'small'
													? 'medium'
													: gridSize === 'medium'
														? 'large'
														: 'tiny'
											: tableSize === 'tiny'
												? 'small'
												: tableSize === 'small'
													? 'medium'
													: tableSize === 'medium'
														? 'large'
														: 'tiny';

									if (view === 'grid') {
										gridSize = newSize;
									} else {
										tableSize = newSize;
									}
									storeUserPreference(view, gridSize, tableSize);
								}}
								type="button"
								aria-label="Tiny"
								class="px-1"
							>
								<iconify-icon icon="material-symbols:apps" height="40" style="color:text-black dark:text-white"></iconify-icon>
								<p class="text-xs">Tiny</p>
							</button>
						{:else if (view === 'grid' && gridSize === 'small') || (view === 'table' && tableSize === 'small')}
							<button
								onclick={() => {
									const newSize =
										view === 'grid'
											? gridSize === 'tiny'
												? 'small'
												: gridSize === 'small'
													? 'medium'
													: gridSize === 'medium'
														? 'large'
														: 'tiny'
											: tableSize === 'tiny'
												? 'small'
												: tableSize === 'small'
													? 'medium'
													: tableSize === 'medium'
														? 'large'
														: 'tiny';

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
								<iconify-icon icon="material-symbols:background-grid-small-sharp" height="40" style="color:text-black dark:text-white"></iconify-icon>
								<p class="text-xs">Small</p>
							</button>
						{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
							<button
								onclick={() => {
									const newSize =
										view === 'grid'
											? gridSize === 'tiny'
												? 'small'
												: gridSize === 'small'
													? 'medium'
													: gridSize === 'medium'
														? 'large'
														: 'tiny'
											: tableSize === 'tiny'
												? 'small'
												: tableSize === 'small'
													? 'medium'
													: tableSize === 'medium'
														? 'large'
														: 'tiny';

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
								<iconify-icon icon="material-symbols:grid-on-sharp" height="40" style="color: text-black dark:text-white"></iconify-icon>
								<p class="text-xs">Medium</p>
							</button>
						{:else}
							<button
								onclick={() => {
									const newSize =
										view === 'grid'
											? gridSize === 'tiny'
												? 'small'
												: gridSize === 'small'
													? 'medium'
													: gridSize === 'medium'
														? 'large'
														: 'tiny'
											: tableSize === 'tiny'
												? 'small'
												: tableSize === 'small'
													? 'medium'
													: tableSize === 'medium'
														? 'large'
														: 'tiny';

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
								<iconify-icon icon="material-symbols:grid-view" height="40" style="color: text-black dark:text-white"></iconify-icon>
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
					{#if (view === 'grid' && gridSize === 'tiny') || (view === 'table' && tableSize === 'tiny')}
						<button
							onclick={() => {
								const newSize =
									view === 'grid'
										? gridSize === 'tiny'
											? 'small'
											: gridSize === 'small'
												? 'medium'
												: gridSize === 'medium'
													? 'large'
													: 'tiny'
										: tableSize === 'tiny'
											? 'small'
											: tableSize === 'small'
												? 'medium'
												: tableSize === 'medium'
													? 'large'
													: 'tiny';

								if (view === 'grid') {
									gridSize = newSize;
								} else {
									tableSize = newSize;
								}
								storeUserPreference(view, gridSize, tableSize);
							}}
							type="button"
							class="px-1 md:px-2"
							aria-label="Tiny"
						>
							<iconify-icon icon="material-symbols:apps" height="40"></iconify-icon>
							<br /><span class="text-tertiary-500 dark:text-primary-500">Tiny</span>
						</button>
					{:else if (view === 'grid' && gridSize === 'small') || (view === 'table' && tableSize === 'small')}
						<button
							onclick={() => {
								const newSize =
									view === 'grid'
										? gridSize === 'tiny'
											? 'small'
											: gridSize === 'small'
												? 'medium'
												: gridSize === 'medium'
													? 'large'
													: 'tiny'
										: tableSize === 'tiny'
											? 'small'
											: tableSize === 'small'
												? 'medium'
												: tableSize === 'medium'
													? 'large'
													: 'tiny';

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
										? gridSize === 'tiny'
											? 'small'
											: gridSize === 'small'
												? 'medium'
												: gridSize === 'medium'
													? 'large'
													: 'tiny'
										: tableSize === 'tiny'
											? 'small'
											: tableSize === 'small'
												? 'medium'
												: tableSize === 'medium'
													? 'large'
													: 'tiny';

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
										? gridSize === 'tiny'
											? 'small'
											: gridSize === 'small'
												? 'medium'
												: gridSize === 'medium'
													? 'large'
													: 'tiny'
										: tableSize === 'tiny'
											? 'small'
											: tableSize === 'small'
												? 'medium'
												: tableSize === 'medium'
													? 'large'
													: 'tiny';

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
		<MediaTable {filteredFiles} tableSize={safeTableSize} ondeleteImage={handleDeleteImage} />
	{/if}
</div>
