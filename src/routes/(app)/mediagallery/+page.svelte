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
	import { toggleUIElement } from '@src/stores/UIStore.svelte.ts';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte.ts';
	// Logger
	import { logger } from '@utils/logger';
	// Utils & Media
	import { publicEnv } from '@src/stores/globalSettings.svelte';
	import { MediaTypeEnum, type MediaBase, type MediaImage } from '@utils/media/mediaModels';
	// Components
	import Breadcrumb from '@components/Breadcrumb.svelte';
	import PageTitle from '@components/PageTitle.svelte';
	import MediaGrid from './MediaGrid.svelte';
	import MediaTable from './MediaTable.svelte';
	import VirtualMediaGrid from './VirtualMediaGrid.svelte';
	import AdvancedSearchModal from './AdvancedSearchModal.svelte';
	import ImageEditorModal from '@src/components/imageEditor/ImageEditorModal.svelte';
	import SystemTooltip from '@components/system/SystemTooltip.svelte';
	// Skeleton
	import { toaster } from '@stores/store.svelte.ts';
	// Import types
	import type { SystemVirtualFolder } from '@src/databases/dbInterface';
	import type { SearchCriteria } from '@utils/media/advancedSearch';

	// Initialize modal store
	// const modalStore = getModalStore();
	import { modalState } from '@utils/modalState.svelte';
	import { showConfirm } from '@utils/modalUtils';
	import ModalPrompt from '@components/ModalPrompt.svelte';

	import type { PageData } from './$types';

	// Props using runes
	let { data }: { data: PageData } = $props();

	// State using runes
	let files: (MediaBase | MediaImage)[] = $state([]);
	let allSystemVirtualFolders: any[] = $state([]);
	let currentSystemVirtualFolder: SystemVirtualFolder | null = $state(null);
	let breadcrumb: string[] = $state([]);

	let globalSearchValue = $state('');
	let selectedMediaType: 'All' | MediaTypeEnum = $state('All');
	let view: 'grid' | 'table' = $state('grid');
	let gridSize: 'tiny' | 'small' | 'medium' | 'large' = $state('small');
	let tableSize: 'tiny' | 'small' | 'medium' | 'large' = $state('small');
	let isLoading = $state(false);

	// Enterprise features state
	let advancedSearchCriteria: SearchCriteria | null = $state(null);

	// Performance optimization: Use virtual scrolling for large collections
	const USE_VIRTUAL_THRESHOLD = 100;

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
	const filteredFiles = $derived.by(() => {
		const results = files.filter((file) => {
			const matchesSearch = (file.filename || '').toLowerCase().includes(globalSearchValue.toLowerCase());
			const matchesType = selectedMediaType === 'All' || file.type === selectedMediaType;
			return matchesSearch && matchesType;
		});

		// Apply advanced search criteria if set
		if (advancedSearchCriteria) {
			// Import the advancedSearch function if criteria is active
			// This will be handled by the modal's onSearch callback
			return results;
		}

		return results;
	});

	// Performance optimization: Use virtual scrolling for large collections
	const useVirtualScrolling = $derived(filteredFiles.length > USE_VIRTUAL_THRESHOLD);

	// Computed folders for breadcrumb - create a mapping of breadcrumb paths to folder IDs
	const breadcrumbFolders = $derived.by(() => {
		const folders: { _id: string; name: string; path: string[] }[] = [];

		// Always add root as first folder
		folders.push({
			_id: 'root',
			name: 'Media Root',
			path: []
		});

		if (!currentSystemVirtualFolder) {
			return folders;
		}

		let current: SystemVirtualFolder | null = currentSystemVirtualFolder;
		const pathSegments: string[] = [];

		const tempFolders: { _id: string; name: string; path: string[] }[] = [];
		while (current) {
			pathSegments.unshift(current.name);
			tempFolders.unshift({
				_id: current._id,
				name: current.name,
				path: [...pathSegments] // Copy the current path
			});
			// Find the parent folder
			current = allSystemVirtualFolders.find((f) => f._id === current?.parentId) || null;
		}

		return [...folders, ...tempFolders];
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
	const safeTableSize = $derived(tableSize);

	// Initialize component with runes
	// Run once on mount to set up initial data
	$effect(() => {
		// Load initial data from server
		if (data && data.systemVirtualFolders) {
			allSystemVirtualFolders = data.systemVirtualFolders.map((folder: SystemVirtualFolder) => ({
				...folder,
				path: Array.isArray(folder.path) ? folder.path : folder.path?.split('/')
			}));
		}

		if (data && data.currentFolder) {
			currentSystemVirtualFolder = data.currentFolder;
		}

		if (data && data.media) {
			files = data.media.map((m: any) => ({
				...m,
				user: typeof m.user === 'object' && m.user ? m.user._id : m.user
			})) as (MediaBase | MediaImage)[];
		}

		// Load user preferences
		const userPreference = getUserPreferenceFromLocalStorageOrCookie();
		if (userPreference) {
			const [preferredView, preferredGridSize, preferredTableSize] = userPreference.split('/');
			view = preferredView as 'grid' | 'table';
			gridSize = preferredGridSize as 'tiny' | 'small' | 'medium' | 'large';
			tableSize = preferredTableSize as 'tiny' | 'small' | 'medium' | 'large';
		}

		// Listen for folder selection events
		const handleSystemVirtualFolderSelected = (event: CustomEvent) => {
			const { folderId } = event.detail;
			openSystemVirtualFolder(folderId && folderId !== 'root' ? folderId : null);
		};

		document.addEventListener('systemVirtualFolderSelected', handleSystemVirtualFolderSelected as EventListener);

		return () => {
			document.removeEventListener('systemVirtualFolderSelected', handleSystemVirtualFolderSelected as EventListener);
		};
	});

	// Update breadcrumb when current folder changes
	$effect(() => {
		// This effect only runs when currentSystemVirtualFolder or allSystemVirtualFolders changes
		updateBreadcrumb();
	});
	// Function to update breadcrumb based on current folder
	function updateBreadcrumb() {
		if (!currentSystemVirtualFolder) {
			// At root level - show Media Root
			breadcrumb = ['Media Root'];
			return;
		}

		// Build breadcrumb by traversing up the parent hierarchy
		const buildBreadcrumb = (folder: SystemVirtualFolder): string[] => {
			const path: string[] = ['Media Root']; // Always start with root
			let current: SystemVirtualFolder | null = folder;

			const folderPath: string[] = [];
			while (current) {
				folderPath.unshift(current.name); // Add folder name to the beginning
				// Find the parent folder
				current = allSystemVirtualFolders.find((f) => f._id === current?.parentId) || null;
			}

			return [...path, ...folderPath];
		};

		breadcrumb = buildBreadcrumb(currentSystemVirtualFolder);
	}

	// Create a new virtual folder with validation
	async function createSystemVirtualFolder(folderName: string) {
		// Validate folder name
		const trimmedName = folderName.trim();
		if (!trimmedName) {
			toaster.error({ description: 'Folder name cannot be empty' });
			return;
		}

		if (/[\\/:"*?<>|]/.test(trimmedName)) {
			toaster.error({ description: 'Folder name contains invalid characters (\\ / : * ? " < > |)' });
			return;
		}

		if (trimmedName.length > 50) {
			toaster.error({ description: 'Folder name must be 50 characters or less' });
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

				// Notify Collections component
				document.dispatchEvent(
					new CustomEvent('folderCreated', {
						detail: { folder: result.folder, parentId }
					})
				);

				toaster.success({ description: 'Folder created successfully' });
			} else {
				throw new Error(result.error || 'Failed to create folder');
			}
		} catch (error) {
			logger.error('Error creating folder:', error);
			const errorMessage =
				error instanceof Error && error.message.includes('duplicate')
					? error.message
					: error instanceof Error && error.message.includes('invalid')
						? 'Invalid folder name'
						: 'Failed to create folder';
			toaster.error({ description: errorMessage });
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
			logger.error('Error fetching updated folders:', error);
			toaster.error({ description: 'Failed to fetch folders' });
			return [];
		}
	}

	// Memoized fetch for media files
	let lastSystemFolderId = $state<string | null>(null);
	async function fetchMediaFiles(forceRefresh = false) {
		const folderId = currentSystemVirtualFolder ? currentSystemVirtualFolder._id : 'root';

		// Skip if already loading or same folder (unless force refresh)
		if (!forceRefresh && (isLoading || folderId === lastSystemFolderId)) return;

		isLoading = true;
		globalLoadingStore.startLoading(loadingOperations.dataFetch);
		lastSystemFolderId = folderId;

		try {
			const { data } = await axios.get(`/api/systemVirtualFolder/${folderId}`, {
				timeout: 10000 // 10 second timeout
			});

			if (data.success) {
				files = Array.isArray(data.data.contents?.files) ? data.data.contents.files : [];
				logger.info(`Fetched ${files.length} files for folder: ${folderId}`);
				// Folders are handled by allSystemVirtualFolders
			} else {
				throw new Error(data.error || 'Unknown error');
			}
		} catch (error: unknown) {
			logger.error('Error fetching media files:', error);
			let errorMessage = 'Failed to load media';
			if (error instanceof Error) {
				if (error.message.includes('timeout')) {
					errorMessage = 'Request timed out - please try again';
				} else if (error.message.includes('network')) {
					errorMessage = 'Network error - please check your connection';
				}
			}
			toaster.error({ description: errorMessage });
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
			logger.error('Error opening folder:', error);
			toaster.error({ description: 'Failed to open folder' });
		}
	}

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
		modalState.trigger(
			ModalPrompt as any,
			{
				title: 'Add Folder',
				body: `Creating subfolder in: <span class="text-tertiary-500 dark:text-primary-500">${currentFolderPath}</span>`
			},
			(r: string) => {
				if (r) createSystemVirtualFolder(r);
			}
		);
	}

	// Handle delete image
	async function handleDeleteImage(file: MediaBase) {
		// Show confirmation modal
		showConfirm({
			title: `Delete ${file.filename}`,
			body: `Are you sure you want to delete <span class="text-tertiary-500 dark:text-primary-500 font-bold">"${file.filename}"</span>? This action cannot be undone.`,
			onConfirm: async () => {
				try {
					logger.info('Delete image request:', { _id: file._id, filename: file.filename });

					const formData = new FormData();
					formData.append('imageData', JSON.stringify(file));

					const response = await fetch('?/deleteMedia', {
						method: 'POST',
						body: formData
					});

					logger.info('Delete response status:', response.status);

					if (!response.ok) {
						const errorText = await response.text();
						logger.error('Delete failed with status:', response.status, errorText);
						throw new Error(`Server error: ${response.status} - ${errorText}`);
					}

					const result = await response.json();
					logger.debug('Delete response:', result);

					// Handle SvelteKit's wrapped response format
					let data = result;
					if (result.type === 'success' && result.data) {
						// Parse if data is a string
						data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
					}

					// Check if it's an array response (like upload)
					const success = Array.isArray(data) ? data[0]?.success : data?.success;

					if (success) {
						toaster.success({ description: 'Media deleted successfully.' });

						// Reactively remove the deleted file from the files array
						// Svelte 5 runes will automatically update all derived state
						files = files.filter((f) => f._id !== file._id);

						logger.info(`Removed file ${file.filename} from UI. Remaining: ${files.length} files`);
					} else {
						throw new Error(data?.error || 'Failed to delete media');
					}
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					logger.error('Error deleting media:', errorMessage);
					toaster.error({ description: `Error deleting media: ${errorMessage}` });
				}
			}
		});
	}

	// Handle bulk delete
	async function handleBulkDelete(filesToDelete: MediaBase[]) {
		// Show confirmation modal
		showConfirm({
			title: 'Delete Multiple Media',
			body: `Are you sure you want to delete ${filesToDelete.length} file${filesToDelete.length > 1 ? 's' : ''}? This action cannot be undone.`,
			onConfirm: async () => {
				try {
					logger.info('Bulk delete request:', { count: filesToDelete.length });

					// Track successfully deleted files
					const successfullyDeletedIds = new Set();
					let successCount = 0;
					let failCount = 0;

					for (const file of filesToDelete) {
						try {
							const formData = new FormData();
							formData.append('imageData', JSON.stringify(file));

							const response = await fetch('?/deleteMedia', {
								method: 'POST',
								body: formData
							});

							if (response.ok) {
								const result = await response.json();
								let data = result;
								if (result.type === 'success' && result.data) {
									data = typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
								}
								const success = Array.isArray(data) ? data[0]?.success : data?.success;
								if (success) {
									successCount++;
									successfullyDeletedIds.add(file._id as string);
								} else {
									failCount++;
								}
							} else {
								failCount++;
							}
						} catch (error) {
							logger.error('Error deleting file:', file.filename, error);
							failCount++;
						}
					}

					// Show result
					if (failCount === 0) {
						toaster.success({ description: `Successfully deleted ${successCount} file${successCount > 1 ? 's' : ''}` });
					} else if (successCount === 0) {
						toaster.error({ description: `Failed to delete ${failCount} file${failCount > 1 ? 's' : ''}` });
					} else {
						toaster.warning({ description: `Deleted ${successCount} file${successCount > 1 ? 's' : ''}, ${failCount} failed` });
					}

					// Reactively remove only successfully deleted files
					// Svelte 5 runes will automatically update filteredFiles derived state
					files = files.filter((f) => !successfullyDeletedIds.has(f._id as string));

					logger.info(`Removed ${successCount} files from UI. Remaining: ${files.length} files`);
				} catch (error) {
					const errorMessage = error instanceof Error ? error.message : String(error);
					logger.error('Error in bulk delete:', errorMessage);
					toaster.error({ description: `Error deleting media: ${errorMessage}` });
				}
			}
		});
	}

	// Handle advanced search
	async function handleAdvancedSearch(criteria: SearchCriteria) {
		try {
			const response = await fetch('/api/media/search', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ criteria })
			});

			if (!response.ok) throw new Error('Search failed');

			const result = await response.json();

			// Update files with search results
			files = result.files;
			advancedSearchCriteria = criteria;
			modalState.close(); // Close the modal

			toaster.success({
				description: `Found ${result.totalCount} file${result.totalCount === 1 ? '' : 's'} matching ${result.matchedCriteria.length} criteria`
			});
		} catch (error) {
			logger.error('Advanced search error:', error);
			toaster.error({ description: 'Search failed. Please try again.' });
		}
	}

	// Clear advanced search
	function clearAdvancedSearch() {
		advancedSearchCriteria = null;
		fetchMediaFiles(); // Reload all files
	}

	function openAdvancedSearch() {
		modalState.trigger(AdvancedSearchModal as any, {
			files,
			onSearch: handleAdvancedSearch,
			modalClasses: 'max-w-4xl max-h-[95vh]' // Override default width
		});
	}

	/*
	-------------------------------------------------------------------------
	IMAGE EDITOR HANDLERS (Via Modal)
	-------------------------------------------------------------------------
	*/

	// Define state for Image Editor
	// let imageToEdit: any = $state(null); // No longer needed
	// let showEditor = $state(false);      // No longer needed

	import { mediaUrl } from '@utils/media/mediaUtils';

	// ... (existing imports)

	async function handleEditImage(file: any) {
		console.log('handleEditImage called with:', file);
		if (!file) {
			console.warn('handleEditImage: File is null/undefined');
			return;
		}

		// IMPORTANT: Always use mediaUrl() to construct the proper URL
		// The file.url property contains a relative path (e.g., "images/xxx.jpg")
		// but the image editor needs the full path (e.g., "/files/images/xxx.jpg")
		const fullUrl = mediaUrl(file);
		console.log('Image URL for editor:', { originalUrl: file.url, fullUrl });

		if (!fullUrl) {
			console.error('Failed to construct URL for image:', file);
			toaster.error({ description: 'Cannot edit image: Invalid URL' });
			return;
		}

		const imageWithUrl = { ...file, url: fullUrl };

		// Trigger the modal via modalState
		// Always use fullscreen for image editor - provides best editing experience
		// and ensures proper height propagation for the canvas
		modalState.trigger(ImageEditorModal as any, {
			image: imageWithUrl,
			onsave: handleEditorSave,
			modalClasses: 'w-full h-full max-w-none max-h-none',
			size: 'fullscreen'
		});
	}

	async function handleEditorSave(detail: { dataURL: string; file: File; operations?: any; focalPoint?: any; mediaId?: string }) {
		const { file, operations, focalPoint, mediaId } = detail;

		const formData = new FormData();
		formData.append('file', file);
		if (mediaId) formData.append('mediaId', mediaId);
		if (operations) formData.append('operations', JSON.stringify(operations));
		if (focalPoint) formData.append('focalPoint', JSON.stringify(focalPoint));

		try {
			const response = await fetch('/api/media/edit', {
				method: 'POST',
				body: formData
			});

			if (response.ok) {
				toaster.success({ description: 'Image saved successfully!' });
				fetchMediaFiles(true); // Force refresh
			} else {
				const errorData = await response.json();
				throw new Error(errorData.error || 'Failed to save edited image');
			}
		} catch (err) {
			toaster.error({ description: err instanceof Error ? err.message : 'Error saving image' });
			logger.error('Error saving edited image', err);
		}
	}
	function handleUpdateImage(updatedFile: MediaImage) {
		const index = files.findIndex((f) => f._id === updatedFile._id);
		if (index !== -1) {
			files[index] = updatedFile;
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
				logger.error('Navigation error:', error);
				// Fallback to home page if history.back() fails
				goto('/');
			}
		}}
	/>

	<!-- Row 2: Action Buttons -->
	<div class="lgd:mt-0 flex items-center justify-center gap-4 lg:justify-end">
		<!-- Add folder with loading state -->
		<button
			onclick={openAddFolderModal}
			aria-label="Add folder"
			class="preset-filled-tertiary-500 btn gap-2"
			disabled={isLoading}
			aria-busy={isLoading}
		>
			<iconify-icon icon="mdi:folder-add-outline" width={24}></iconify-icon>
			{isLoading ? 'Creating...' : 'Add folder'}
			{#if isLoading}
				<span class="loading loading-spinner loading-xs"></span>
			{/if}
		</button>

		<!-- Add Media -->
		<button onclick={() => handleMobileNavigation('/mediagallery/uploadMedia')} aria-label="Add Media" class="preset-filled-primary-500 btn gap-2">
			<iconify-icon icon="carbon:add-filled" width={24}></iconify-icon>
			Add Media
		</button>
	</div>
</div>

<!-- Breadcrumb Navigation -->
<Breadcrumb {breadcrumb} folders={breadcrumbFolders} openFolder={openSystemVirtualFolder} />

<div class="wrapper overflow-auto">
	<div class="mb-8 flex w-full flex-col justify-center gap-1 md:hidden">
		<p class="text-xs font-medium uppercase text-surface-500 dark:text-surface-50">Search</p>
		<div class="flex gap-2">
			<div class="input-group input-group-divider grid flex-1 grid-cols-[1fr_auto]">
				<input id="globalSearch" type="text" placeholder="Search Media" class="input" bind:value={globalSearchValue} />
				{#if globalSearchValue}
					<button onclick={() => (globalSearchValue = '')} aria-label="Clear search" class="preset-filled-surface-500 w-12">
						<iconify-icon icon="ic:outline-search-off" width={24}></iconify-icon>
					</button>
				{/if}
			</div>
			<!-- Advanced Search Button (Mobile) - Outside input group -->
			<button onclick={openAdvancedSearch} aria-label="Advanced search" class="preset-filled-surface-500 btn" title="Advanced Search">
				<iconify-icon icon="mdi:magnify-plus-outline" width={24}></iconify-icon>
			</button>
		</div>

		<div class="mt-4 flex flex-row items-end justify-between gap-1 overflow-x-auto pb-2">
			<div class="flex flex-col items-center gap-1">
				<p class="text-xs font-medium uppercase text-surface-500 dark:text-surface-50">Type</p>
				<div class="h-11 w-20">
					<select id="mediaType" bind:value={selectedMediaType} class="select h-full text-[10px] p-1">
						{#each mediaTypes as type}
							<option value={type.value}>{type.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="flex flex-col items-center gap-1">
				<p class="text-xs font-medium uppercase text-surface-500 dark:text-surface-50">Sort</p>
				<button id="sortButton" aria-label="Sort" class="preset-outline btn-icon h-11 w-11 flex flex-col items-center justify-center p-0">
					<iconify-icon icon="flowbite:sort-outline" width={20}></iconify-icon>
					<span class="text-xs">Asc</span>
				</button>
			</div>

			<div class="flex flex-col items-center gap-1">
				<p class="text-xs font-medium uppercase text-surface-500 dark:text-surface-50">Display</p>
				<div class="h-11">
					{#if view === 'grid'}
						<SystemTooltip title="Switch to Table View">
							<button
								onclick={() => handleViewChange('table')}
								aria-label="Table"
								class="preset-outline btn-icon h-11 w-12 flex flex-col items-center justify-center p-0"
							>
								<iconify-icon icon="material-symbols:list-alt-outline" width={20}></iconify-icon>
								<p class="text-xs">Table</p>
							</button>
						</SystemTooltip>
					{:else}
						<SystemTooltip title="Switch to Grid View">
							<button
								onclick={() => handleViewChange('grid')}
								aria-label="Grid"
								class="preset-outline btn-icon h-11 w-12 flex flex-col items-center justify-center p-0"
							>
								<iconify-icon icon="material-symbols:grid-view-rounded" width={20}></iconify-icon>
								<p class="text-xs">Grid</p>
							</button>
						</SystemTooltip>
					{/if}
				</div>
			</div>

			<div class="flex flex-col items-center gap-1">
				<p class="text-xs font-medium uppercase text-surface-500 dark:text-surface-50">Size</p>
				<div class="h-11">
					{#if (view === 'grid' && gridSize === 'tiny') || (view === 'table' && tableSize === 'tiny')}
						<SystemTooltip title="Change Display Size">
							<button
								onclick={() => {
									if (view === 'grid') gridSize = 'small';
									else tableSize = 'small';
									storeUserPreference(view, gridSize, tableSize);
								}}
								type="button"
								class="preset-outline btn-icon h-11 w-12 flex flex-col items-center justify-center p-0"
							>
								<iconify-icon icon="material-symbols:apps" width={20}></iconify-icon>
								<p class="text-xs">Tiny</p>
							</button>
						</SystemTooltip>
					{:else if (view === 'grid' && gridSize === 'small') || (view === 'table' && tableSize === 'small')}
						<SystemTooltip title="Change Display Size">
							<button
								onclick={() => {
									if (view === 'grid') gridSize = 'medium';
									else tableSize = 'medium';
									storeUserPreference(view, gridSize, tableSize);
								}}
								type="button"
								class="preset-outline-surface-500 btn h-11 w-12 flex flex-col items-center justify-center p-0"
							>
								<iconify-icon icon="material-symbols:background-grid-small-sharp" width={20}></iconify-icon>
								<p class="text-xs">Small</p>
							</button>
						</SystemTooltip>
					{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
						<SystemTooltip title="Change Display Size">
							<button
								onclick={() => {
									if (view === 'grid') gridSize = 'large';
									else tableSize = 'large';
									storeUserPreference(view, gridSize, tableSize);
								}}
								type="button"
								class="preset-outline-surface-500 btn h-11 w-12 flex flex-col items-center justify-center p-0"
							>
								<iconify-icon icon="material-symbols:grid-on-sharp" width={20}></iconify-icon>
								<p class="text-xs">Medium</p>
							</button>
						</SystemTooltip>
					{:else}
						<SystemTooltip title="Change Display Size">
							<button
								onclick={() => {
									if (view === 'grid') gridSize = 'tiny';
									else tableSize = 'tiny';
									storeUserPreference(view, gridSize, tableSize);
								}}
								type="button"
								class="preset-outline-surface-500 btn h-11 w-12 flex flex-col items-center justify-center p-0"
							>
								<iconify-icon icon="material-symbols:grid-view" width={20}></iconify-icon>
								<p class="text-xs">Large</p>
							</button>
						</SystemTooltip>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<div class="mb-4 hidden items-end justify-between gap-4 md:flex">
		<!-- Left Side: Search & Advanced -->
		<div class="flex items-end gap-2">
			<div class="flex flex-col gap-1">
				<label for="globalSearchMd" class="text-sm font-medium">Search</label>
				<div class="input-group input-group-divider grid h-11 max-w-md grid-cols-[1fr_auto]">
					<input bind:value={globalSearchValue} id="globalSearchMd" type="text" placeholder="Search" class="input" />
					{#if globalSearchValue}
						<button onclick={clearSearch} class="preset-filled-surface-500 w-12" aria-label="Clear search">
							<iconify-icon icon="ic:outline-search-off" width={24}></iconify-icon>
						</button>
					{/if}
				</div>
			</div>

			<!-- Advanced Search Button (Desktop) -->
			<button onclick={openAdvancedSearch} aria-label="Advanced search" class="preset-filled-surface-500 btn gap-2" title="Advanced Search">
				<iconify-icon icon="mdi:magnify-plus-outline" width={24}></iconify-icon>
				Advanced
			</button>
		</div>

		<!-- Right Side: Type, Sort, Display, Size -->
		<div class="flex items-center gap-4">
			<div class="flex flex-col gap-1">
				<label for="mediaTypeMd" class="text-sm font-medium">Type</label>
				<div class="input-group h-11">
					<select id="mediaTypeMd" bind:value={selectedMediaType} class="select">
						{#each mediaTypes as type}
							<option value={type.value}>{type.label}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="flex flex-col gap-1 text-center">
				<label for="sortButton" class="text-sm font-medium">Sort</label>
				<button id="sortButton" class="preset-tonal-surface-500 btn h-11" aria-label="Sort">
					<iconify-icon icon="flowbite:sort-outline" width={24}></iconify-icon>
				</button>
			</div>

			<div class="flex flex-col items-start gap-1">
				<span class="text-sm font-medium">Display</span>
				<div class="h-11 flex border border-surface-500/30 rounded-token overflow-hidden">
					<button
						onclick={() => handleViewChange(view === 'grid' ? 'table' : 'grid')}
						class="h-full px-3 flex items-center gap-2 transition-colors hover:bg-surface-500/10"
						aria-label="Toggle View"
						title="Toggle between Grid and Table"
					>
						<iconify-icon icon="material-symbols:grid-view-rounded" width={24} class={view === 'grid' ? 'text-primary-500' : 'text-surface-500'}
						></iconify-icon>
						<iconify-icon icon="material-symbols:list-alt-outline" width={24} class={view === 'table' ? 'text-primary-500' : 'text-surface-500'}
						></iconify-icon>
					</button>
				</div>
			</div>

			<div class="flex flex-col items-start gap-1">
				<span class="text-sm font-medium">Size</span>
				<div class="h-11 flex divide-x divide-gray-500 border border-surface-500/30 rounded-token overflow-hidden">
					{#if (view === 'grid' && gridSize === 'tiny') || (view === 'table' && tableSize === 'tiny')}
						<button
							onclick={() => {
								if (view === 'grid') gridSize = 'small';
								else tableSize = 'small';
								storeUserPreference(view, gridSize, tableSize);
							}}
							class="h-full px-3 flex flex-row items-center gap-2 transition-colors hover:bg-surface-500/10"
							aria-label="Tiny - Click for Small"
							title="Tiny (Click to change)"
						>
							<iconify-icon icon="material-symbols:apps" width={24}></iconify-icon>
							<span class="text-[10px] hidden xl:inline">Tiny</span>
						</button>
					{:else if (view === 'grid' && gridSize === 'small') || (view === 'table' && tableSize === 'small')}
						<button
							onclick={() => {
								if (view === 'grid') gridSize = 'medium';
								else tableSize = 'medium';
								storeUserPreference(view, gridSize, tableSize);
							}}
							class="h-full px-3 flex flex-row items-center gap-2 transition-colors hover:bg-surface-500/10"
							aria-label="Small - Click for Medium"
							title="Small (Click to change)"
						>
							<iconify-icon icon="material-symbols:background-grid-small-sharp" width={24}></iconify-icon>
							<span class="text-[10px] hidden xl:inline">Small</span>
						</button>
					{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
						<button
							onclick={() => {
								if (view === 'grid') gridSize = 'large';
								else tableSize = 'large';
								storeUserPreference(view, gridSize, tableSize);
							}}
							class="h-full px-3 flex flex-row items-center gap-2 transition-colors hover:bg-surface-500/10"
							aria-label="Medium - Click for Large"
							title="Medium (Click to change)"
						>
							<iconify-icon icon="material-symbols:grid-on-sharp" width={24}></iconify-icon>
							<span class="text-[10px] hidden xl:inline">Medium</span>
						</button>
					{:else}
						<button
							onclick={() => {
								if (view === 'grid') gridSize = 'tiny';
								else tableSize = 'tiny';
								storeUserPreference(view, gridSize, tableSize);
							}}
							class="h-full px-3 flex flex-row items-center gap-2 transition-colors hover:bg-surface-500/10"
							aria-label="Large - Click for Tiny"
							title="Large (Click to change)"
						>
							<iconify-icon icon="material-symbols:grid-view" width={24}></iconify-icon>
							<span class="text-[10px] hidden xl:inline">Large</span>
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>

	{#if view === 'grid'}
		{#if useVirtualScrolling}
			<!-- Enterprise Virtual Scrolling for Large Collections (100+ files) -->
			<VirtualMediaGrid {filteredFiles} {gridSize} ondeleteImage={handleDeleteImage} onBulkDelete={handleBulkDelete} onEditImage={handleEditImage} />
			<div class="alert preset-outline-surface-500 mt-4">
				<iconify-icon icon="mdi:lightning-bolt" width={24}></iconify-icon>
				<span class="text-sm">
					Virtual scrolling enabled for optimal performance with {filteredFiles.length} files
				</span>
			</div>
		{:else}
			<!-- Standard Grid for Smaller Collections -->
			<MediaGrid
				{filteredFiles}
				{gridSize}
				ondeleteImage={handleDeleteImage}
				onBulkDelete={handleBulkDelete}
				onEditImage={handleEditImage}
				onUpdateImage={handleUpdateImage}
			/>
		{/if}
	{:else}
		<MediaTable
			{filteredFiles}
			tableSize={safeTableSize}
			ondeleteImage={handleDeleteImage}
			onEditImage={handleEditImage}
			onUpdateImage={handleUpdateImage}
			onDeleteFiles={handleBulkDelete}
		/>
	{/if}
</div>

<!-- Editor Modal -->

<!-- Modals -->

<!-- Active Search Indicator -->
{#if advancedSearchCriteria}
	<div class="alert preset-filled-warning-500 fixed bottom-4 right-4 z-40 max-w-sm">
		<iconify-icon icon="mdi:filter" width={24}></iconify-icon>
		<div class="flex-1">
			<p class="font-semibold">Advanced search active</p>
			<p class="text-sm opacity-90">Showing filtered results</p>
		</div>
		<button onclick={clearAdvancedSearch} class="preset-outline-surface-500 btn-icon btn-sm" aria-label="Clear search">
			<iconify-icon icon="mdi:close" width={18}></iconify-icon>
		</button>
	</div>
{/if}
