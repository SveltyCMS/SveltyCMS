<script lang="ts">
	import type { ImageFiles } from '@src/utils/types';
	import { SIZES, formatBytes } from '@src/utils/utils';
	import axios from 'axios';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import PageTitle from './PageTitle.svelte';
	import { publicEnv } from '@root/config/public';

	export let onselect: any = () => {};
	let files: ImageFiles[] = [];
	axios.get('/media/getAll').then((res) => (files = res.data));

	let globalSearchValue = ''; // Initialize your search value

	// Reactive statement to filter files
	$: filteredFiles = files.filter((file) => file.thumbnail.name.toLowerCase().includes(globalSearchValue.toLowerCase()));

	let showInfo = Array.from({ length: files.length }, () => false);
	// Define orderedSizes
	const orderedSizes = ['thumbnail', ...Object.keys(publicEnv.IMAGE_SIZES), 'original'];

	// Buttons
	let searchShow = false;
	const density = 'normal';

	// Define the view, gridSize, and tableSize variables with the appropriate types
	let view: 'grid' | 'table' = 'grid';
	let gridSize: 'small' | 'medium' | 'large' = 'small';
	let tableSize: 'small' | 'medium' | 'large' = 'small';

	// Get the user's preferred view, grid size, and table size from local storage or a cookie
	const userPreference = getUserPreferenceFromLocalStorageOrCookie();
	if (userPreference) {
		const [preferredView, preferredGridSize, preferredTableSize] = userPreference.split('/');
		view = preferredView as 'grid' | 'table';
		gridSize = preferredGridSize as 'small' | 'medium' | 'large';
		tableSize = preferredTableSize as 'small' | 'medium' | 'large';
	}

	// Define a function to store the user's preferred view, grid size, and table size
	function storeUserPreference(view: 'grid' | 'table', gridSize: 'small' | 'medium' | 'large', tableSize: 'small' | 'medium' | 'large') {
		// Store the view, grid size, and table size for the current user in local storage or a cookie
		const userPreference = `${view}/${gridSize}/${tableSize}`;
		localStorage.setItem('GalleryUserPreference', userPreference);
	}

	function getUserPreferenceFromLocalStorageOrCookie(): string | null {
		return localStorage.getItem('GalleryUserPreference');
	}

	function handleClick() {
		// Update the size of the currently displayed view
		if (view === 'grid') {
			//Reset DND
			view;
			// Update the size of the grid view
			if (gridSize === 'small') {
				gridSize = 'medium';
			} else if (gridSize === 'medium') {
				gridSize = 'large';
			} else {
				gridSize = 'small';
			}
		} else {
			// Update the size of the table view
			if (tableSize === 'small') {
				tableSize = 'medium';
			} else if (tableSize === 'medium') {
				tableSize = 'large';
			} else {
				tableSize = 'small';
			}
		}

		// Store the new sizes for the current user
		const userPreference = `${view}/${gridSize}/${tableSize}`;
		localStorage.setItem('GalleryUserPreference', userPreference);
	}

	//Todo: Check if media is used in a collection before delete is possible
	async function handleDeleteImage(image) {
		try {
			const response = await fetch(`/api/deleteImage/${encodeURIComponent(image.thumbnail)}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				// Image was successfully deleted
			} else {
				// Handle error
				console.error('Error deleting image:', response.statusText);
			}
		} catch (error) {
			console.error('Error deleting image:', error);
		}
	}
</script>

<div class="flex items-center justify-between">
	<PageTitle name={m.mediagallery_pagetitle()} icon="bi:images" iconColor="text-tertiary-500 dark:text-primary-500" />
</div>

<div class=" wrapper">
	<div class="mb-2 flex items-center justify-between gap-4">
		<!-- search/display -->
		<div class="input-group input-group-divider grid grid-cols-[auto_1fr_auto]">
			<!-- Search -->
			<input
				type="text"
				placeholder="Search..."
				class="input h-12 w-64 outline-none transition-all duration-500 ease-in-out"
				bind:value={globalSearchValue}
				on:blur={() => (searchShow = false)}
				on:keydown={(e) => e.key === 'Enter' && (searchShow = false)}
			/>
			{#if globalSearchValue}
				<button
					on:click={() => {
						globalSearchValue = '';
					}}
					on:keydown={(event) => {
						if (event.key === 'Enter' || event.key === ' ') {
							globalSearchValue = '';
						}
					}}
					class="variant-filled-surface w-12"
					><iconify-icon icon="ic:outline-search-off" width="24" />
				</button>
			{/if}
		</div>

		<div class="flex items-center justify-center gap-4">
			<!-- Header block -->
			<!-- Mobile -->
			<div class="flex items-center justify-center text-center text-xs sm:hidden">
				<!-- Display Grid / Table -->
				<div class="flex flex-col items-center justify-center">
					<div class="flex sm:divide-x sm:divide-gray-500">
						{#if view === 'grid'}
							<button
								class="btn flex flex-col items-center justify-center px-1"
								on:keydown
								on:click={() => {
									view = 'table';
									storeUserPreference(view, gridSize, tableSize);
								}}
								on:keydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										view = 'table';
										storeUserPreference(view, gridSize, tableSize);
									}
								}}
							>
								<p class="text-center text-xs">{m.mediagallery_display()}</p>
								<iconify-icon icon="material-symbols:grid-view-rounded" height="42" style={`color: text-black dark:text-white`} />
								<p class="text-xs">Table</p>
							</button>
						{:else}
							<button
								class="btn flex flex-col items-center justify-center px-1"
								on:keydown
								on:click={() => {
									view = 'grid';
									storeUserPreference(view, gridSize, tableSize);
								}}
								on:keydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										view = 'grid';
										storeUserPreference(view, gridSize, tableSize);
									}
								}}
							>
								<p class="text-center text-xs">{m.mediagallery_display()}</p>
								<iconify-icon icon="material-symbols:list-alt-outline" height="44" style={`color: text-black dark:text-white`} />

								<!-- TODO: Center mobile labels -->
								{#if view === 'table'}
									<p class="text-center text-xs">{m.mediagallery_grid()}</p>
								{:else}
									<p class="text-center text-xs">{m.mediagallery_table()}</p>
								{/if}
							</button>
						{/if}
					</div>
				</div>

				<!-- switch between small, medium, and large images -->
				<div class="flex flex-col items-center">
					<p class="text-xs">{m.mediagallery_size()}</p>
					<div class="divide-surface-00 flex divide-x">
						{#if (view === 'grid' && gridSize === 'small') || (view === 'table' && tableSize === 'small')}
							<button type="button" class="px-1" on:click={handleClick}>
								<iconify-icon icon="material-symbols:background-grid-small-sharp" height="40" style={`color:text-black dark:text-white`} />
								<p class="text-xs">{m.mediagallery_small()}</p>
							</button>
						{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
							<button type="button" class="px-1" on:click={handleClick}>
								<iconify-icon icon="material-symbols:grid-on-sharp" height="40" style={`color: text-black dark:text-white`} />
								<p class="text-xs">{m.mediagallery_medium()}</p>
							</button>
						{:else}
							<button type="button" class="px-1" on:click={handleClick}>
								<iconify-icon icon="material-symbols:grid-view" height="40" style={`color: text-black dark:text-white`} />
								<p class="text-xs">{m.mediagallery_large()}</p>
							</button>
						{/if}
					</div>
				</div>
			</div>
			<!-- Desktop -->
			<!-- Display Grid / Table -->
			<div class="hidden flex-col items-center sm:flex">
				Display
				<div class="flex divide-x divide-gray-500">
					<button
						class="px-2"
						on:keydown
						on:click={() => {
							view = 'grid';
							storeUserPreference(view, gridSize, tableSize);
						}}
						on:keydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								view = 'grid';
								storeUserPreference(view, gridSize, tableSize);
							}
						}}
					>
						<iconify-icon icon="material-symbols:grid-view-rounded" height="40" style={`color: ${view === 'grid' ? 'black dark:white' : 'grey'}`} />
						<br /> <span class="text-tertiary-500 dark:text-primary-500">Grid</span>
					</button>
					<button
						class="px-2"
						on:keydown
						on:click={() => {
							view = 'table';
							storeUserPreference(view, gridSize, tableSize);
						}}
						on:keydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								view = 'table';
								storeUserPreference(view, gridSize, tableSize);
							}
						}}
					>
						<iconify-icon icon="material-symbols:list-alt-outline" height="40" style={`color: ${view === 'table' ? 'black dark:white' : 'grey'}`} />
						<br /><span class="text-tertiary-500 dark:text-primary-500">Table</span>
					</button>
				</div>
			</div>

			<!-- switch between small, medium, and large images -->
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

	<!-- Grid display -->
	{#if view === 'grid'}
		<div class="flex max-h-[calc(100%-65px)] flex-wrap items-center gap-4 overflow-auto">
			{#each filteredFiles as file, index}
				<!-- Card -->
				<div
					on:click={() => onselect(file)}
					on:keydown
					on:keydown={(e) => {
						if (e.key === 'Enter' || e.key === ' ') {
							onselect(file);
						}
					}}
					role="button"
					tabindex="0"
					class="group card relative bg-transparent"
				>
					<!-- <div on:click={() => onselect(file)} class="card relative flex w-[100%] flex-col md:w-[30%]"> -->
					<div class="absolute flex w-full items-center bg-surface-500">
						<!-- info flip -->
						<button class="btn-icon" on:click={() => (showInfo[index] = !showInfo[index])}>
							<iconify-icon icon="raphael:info" width="25" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
						</button>

						<p class={` object-cover object-center ${gridSize === 'small' ? 'hidden' : 'mx-auto inline-block  pr-[30px]  '}`}>
							{file.thumbnail.name}
						</p>
					</div>

					{#if !showInfo[index]}
						<img
							src={file.thumbnail.url}
							alt={file.thumbnail.name}
							class={`inline-block object-cover object-center ${
								gridSize === 'small' ? 'h-32 w-32' : gridSize === 'medium' ? 'h-44 w-44' : 'h-80 w-80'
							}`}
						/>
					{:else}
						<!-- file details -->
						<div class="table-container mt-[40px]">
							<table class="table-hover table-auto">
								<thead
									class={`text-tertiary-500 dark:text-primary-500 ${
										gridSize === 'small' ? 'text-xs' : gridSize === 'medium' ? 'text-sm' : 'text-base'
									}`}
								>
									<tr class="border-b-2 border-surface-400 text-center">
										<th class="text-left">Format</th>
										<th class="">Pixel</th>
										<th class="">Size</th>
									</tr>
								</thead>
								<tbody>
									{#each orderedSizes as size}
										<tr
											class={`border-b border-surface-400  last:border-b-0 ${
												gridSize === 'small' ? 'text-xs' : gridSize === 'medium' ? 'text-sm' : 'text-base'
											}`}
										>
											<td class="text-tertiary-500 dark:text-primary-500">
												{size}
											</td>
											<td class="text-right">
												{file[size].width}x{file[size].height}
											</td>
											<td class="text-right">
												{formatBytes(file[size].size)}
											</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{:else}
		Table
	{/if}
</div>
