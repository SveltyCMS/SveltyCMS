<script lang="ts">
	import type { MediaImage } from '@src/utils/types';
	import axios from 'axios';
	import { goto } from '$app/navigation';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import MediaGrid from './MediaGrid.svelte';
	import MediaTable from './MediaTable.svelte';

	// Skeleton
	import { getToastStore } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();

	let files: MediaImage[] = [];
	let globalSearchValue = '';
	let selectedMediaType = 'All';
	let view: 'grid' | 'table' = 'grid';
	let gridSize: 'small' | 'medium' | 'large' = 'small';
	let tableSize: 'small' | 'medium' | 'large' = 'small';

	// Fetch media files
	async function fetchMediaFiles() {
		try {
			const res = await axios.get('/media/getAll');
			files = Array.isArray(res.data)
				? res.data.map((file) => ({
						...file.file,
						type: file.type
					}))
				: [];
		} catch (error) {
			console.error('Error fetching media files:', error);
			files = [];
		}
	}

	// Initial fetch
	fetchMediaFiles();

	// Reactive statement to filter files
	$: filteredFiles = files.filter(
		(file) =>
			file.thumbnail?.name?.toLowerCase()?.includes(globalSearchValue.toLowerCase()) &&
			(selectedMediaType === 'All' || file.type === selectedMediaType)
	);

	// Handle delete image
	async function handleDeleteImage(image) {
		try {
			const response = await fetch(`/api/deleteImage/${encodeURIComponent(image.thumbnail)}`, { method: 'DELETE' });
			const message = response.ok
				? '<iconify-icon icon="mdi:check-outline" color="white" width="26" class="mr-1"></iconify-icon> Image deleted successfully.'
				: '<iconify-icon icon="material-symbols:error" color="white" width="26" class="mr-1"></iconify-icon> Image was not deleted.';

			const background = response.ok ? 'gradient-tertiary' : 'gradient-error';
			toastStore.trigger({ message, background, timeout: 3000, classes: 'border-1 !rounded-md' });

			if (response.ok) fetchMediaFiles();
		} catch (error) {
			console.error('Error deleting image:', error);
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
</script>

<div class="my-2 flex flex-col items-start justify-between gap-2 md:flex-row md:items-center">
	<PageTitle name="Media Gallery" icon="bi:images" iconColor="text-tertiary-500 dark:text-primary-500" />
	<div class="mt-2 flex w-full justify-around gap-2 md:ml-auto md:mt-0 md:w-auto md:flex-row">
		<button disabled class="variant-filled-tertiary btn gap-2" on:click={() => goto('/mediagallery/uploadMedia')}>
			<iconify-icon icon="mdi:folder-add-outline" width="24" />
			Add folder
		</button>
		<button class="variant-filled-primary btn gap-2" on:click={() => goto('/mediagallery/uploadMedia')}>
			<iconify-icon icon="carbon:add-filled" width="24" />
			Add Media
		</button>
	</div>
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
