<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import type { MediaImage } from '@src/utils/types';
	import { formatBytes } from '@src/utils/utils';
	import axios from 'axios';
	import { goto } from '$app/navigation';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import PageTitle from '@components/PageTitle.svelte';

	// Skeleton
	import { getToastStore, popup, type PopupSettings } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();

	// Popup Tooltips
	const FileTooltip: PopupSettings = {
		event: 'click',
		target: 'FileInfo',
		placement: 'right'
	};

	export const onselect: any = () => {};
	let files: MediaImage[] = [];

	// Get all media files
	axios
		.get('/media/getAll')
		.then((res) => {
			if (Array.isArray(res.data)) {
				files = res.data.map((file) => ({
					...file.file,
					type: file.type // Ensure this matches your server response
				}));
			} else {
				files = [];
			}
		})
		.catch((error) => {
			console.error('Error fetching media files:', error);
			files = [];
		});

	let globalSearchValue = ''; // Initialize your search value

	// Reactive statement to filter files
	$: filteredFiles = files.filter(
		(file) =>
			file.thumbnail.name.toLowerCase().includes(globalSearchValue.toLowerCase()) && (selectedMediaType === 'All' || file.type === selectedMediaType)
	);

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

				// Trigger the toast
				const t = {
					message: '<iconify-icon icon="mdi:check-outline" color="white" width="26" class="mr-1"></iconify-icon> Image deleted successfully.',
					// Provide any utility or variant background style:
					background: 'gradient-tertiary',
					timeout: 3000,
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
			} else {
				// Trigger the toast
				const t = {
					message: '<iconify-icon icon="material-symbols:error" color="white" width="26" class="mr-1"></iconify-icon> Image was not deleted.',
					// Provide any utility or variant background style:
					background: 'gradient-error',
					timeout: 3000,
					// Add your custom classes here:
					classes: 'border-1 !rounded-md'
				};
				toastStore.trigger(t);
				// Handle error
				console.error('Error deleting image:', response.statusText);
			}
		} catch (error) {
			console.error('Error deleting image:', error);
		}
	}

	// Table
	let tableData: MediaImage[] = [];
	const filteredTableData: MediaImage[] = [];
	let filters: { [key: string]: string } = {};

	// Pagination
	const rowsPerPage = 10; // Set initial rowsPerPage value
	let currentPage = 1; // Set initial currentPage value

	let isLoading = false;
	let loadingTimer: any; // recommended time of around 200-300ms

	// Display User Token Columns
	const tableHeaders = [
		{ label: m.mediagallery_image(), key: 'thumbnail' },
		{ label: m.mediagallery_name(), key: 'name' },
		{ label: m.mediagallery_size(), key: 'size' },
		{ label: m.mediagallery_hash(), key: 'hash' },
		{ label: m.mediagallery_path(), key: 'path' }
	];

	//Load Table data
	async function refreshTableData() {
		// Clear loading timer
		loadingTimer && clearTimeout(loadingTimer);

		try {
			let responseData: any;

			// Set loading to true
			loadingTimer = setTimeout(() => {
				isLoading = true;
			}, 400);

			// Check if responseData is an array before mapping
			if (Array.isArray(responseData)) {
				// Format the data for the table
				tableData = responseData.map((item) => {
					const formattedItem: any = {};
					for (const header of tableHeaders) {
						const { key } = header;
						formattedItem[key] = item[key] || 'NO DATA';
						if (key === 'createdAt' || key === 'updatedAt') {
							formattedItem[key] = new Date(item[key]).toLocaleString();
						}
						if (key === 'expiresIn') {
							formattedItem[key] = new Date(item[key]).toLocaleString();
						}
					}

					return formattedItem;
				});

				console.log(tableData);
			} else {
				// Handle the case when no data is present
				tableData = [];
			}

			// Reset filters
			filters = {};

			// Set loading to false
			isLoading = false;
			clearTimeout(loadingTimer);
		} catch (error) {
			console.error('Error fetching data:', error);
		}
	}
	//Call refreshTableData initially to populate the table
	refreshTableData();

	// Columns Sorting
	let sorting: { sortedBy: string; isSorted: 0 | 1 | -1 } = {
		sortedBy: tableData.length > 0 ? Object.keys(tableData[0])[0] : '', // Set default sortedBy based on first key in tableData (if available)
		isSorted: 1 // 1 for ascending order, -1 for descending order and 0 for not sorted
	};

	// Define media types
	const mediaTypes = ['All', 'Image', 'Document', 'Audio', 'Video', 'RemoteVideo'];

	// Reactive variable for selected media type
	let selectedMediaType = 'All';
</script>

<div class="my-2 flex items-center justify-between">
	<PageTitle name={m.mediagallery_pagetitle()} icon="bi:images" iconColor="text-tertiary-500 dark:text-primary-500" />
	<button class="variant-filled-primary btn gap-2" on:click={() => goto('/mediagallery/uploadMedia')}>
		<iconify-icon icon="carbon:add-filled" width="24" />
		{m.MediaGallery_Add()}
	</button>
</div>

<div class="wrapper overflow-auto">
	<div class="mb-2 flex items-center justify-between gap-2 md:gap-4">
		<!-- Header -->
		<div class="mb-8 flex w-full flex-col justify-center gap-1">
			<label for="media-type">{m.MediaGallery_Search()}</label>
			<div class="input-group input-group-divider grid max-w-md grid-cols-[auto_1fr_auto]">
				<!-- Search -->
				<input
					type="text"
					placeholder={m.collections_search()}
					class="input"
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
		</div>

		<!-- Additional Media Type Filter -->
		<div class="mb-8 flex flex-col justify-center gap-1">
			<label for="media-type">{m.MediaGallery_Type()}</label>
			<div class="input-group">
				<select bind:value={selectedMediaType} class="">
					{#each mediaTypes as type}
						<option value={type}>{type}</option>
					{/each}
				</select>
			</div>
		</div>

		<!-- Sort by -->
		<div class="mb-8 flex flex-col justify-center gap-1 text-center">
			<label for="media-type">Sort</label>
			<button class="variant-ghost-surface btn">
				<iconify-icon icon="flowbite:sort-outline" width="24" />
			</button>
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
								<p class="text-center text-xs">
									{m.mediagallery_display()}
								</p>
								<iconify-icon icon="material-symbols:grid-view-rounded" height="42" style={`color: text-black dark:text-white`} />
								<p class="text-xs">{m.mediagallery_table()}</p>
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
								<p class="text-center text-xs">
									{m.mediagallery_display()}
								</p>
								<iconify-icon icon="material-symbols:list-alt-outline" height="44" style={`color: text-black dark:text-white`} />

								<!-- TODO: Center mobile labels -->
								{#if view === 'table'}
									<p class="text-center text-xs">
										{m.mediagallery_grid()}
									</p>
								{:else}
									<p class="text-center text-xs">
										{m.mediagallery_table()}
									</p>
								{/if}
							</button>
						{/if}
					</div>
				</div>

				<!-- Switch between small, medium, and large images -->
				<div class="flex flex-col items-center">
					<p class="text-xs">
						{m.mediagallery_size()}
					</p>
					<div class="divide-surface-00 flex divide-x">
						{#if (view === 'grid' && gridSize === 'small') || (view === 'table' && tableSize === 'small')}
							<button type="button" class="px-1" on:click={handleClick}>
								<iconify-icon icon="material-symbols:background-grid-small-sharp" height="40" style={`color:text-black dark:text-white`} />
								<p class="text-xs">
									{m.mediagallery_small()}
								</p>
							</button>
						{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
							<button type="button" class="px-1" on:click={handleClick}>
								<iconify-icon icon="material-symbols:grid-on-sharp" height="40" style={`color: text-black dark:text-white`} />
								<p class="text-xs">
									{m.mediagallery_medium()}
								</p>
							</button>
						{:else}
							<button type="button" class="px-1" on:click={handleClick}>
								<iconify-icon icon="material-symbols:grid-view" height="40" style={`color: text-black dark:text-white`} />
								<p class="text-xs">
									{m.mediagallery_large()}
								</p>
							</button>
						{/if}
					</div>
				</div>
			</div>
			<!-- Desktop -->
			<!-- Display Grid / Table -->
			<div class="hidden flex-col items-center sm:flex">
				{m.mediagallery_display()}
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
						<br /> <span class="text-tertiary-500 dark:text-primary-500">{m.mediagallery_grid()}</span>
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
						<br /><span class="text-tertiary-500 dark:text-primary-500">{m.mediagallery_table()}</span>
					</button>
				</div>
			</div>

			<!-- Switch between small, medium, and large images -->
			<div class="hidden flex-col items-center sm:flex">
				{m.mediagallery_size()}
				<div class="flex divide-x divide-gray-500">
					{#if (view === 'grid' && gridSize === 'small') || (view === 'table' && tableSize === 'small')}
						<button type="button" class="px-1 md:px-2" on:click={handleClick}>
							<iconify-icon icon="material-symbols:background-grid-small-sharp" height="40" />
							<br /><span class="text-tertiary-500 dark:text-primary-500">{m.mediagallery_small()}</span>
						</button>
					{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
						<button type="button" class="px-1 md:px-2" on:click={handleClick}>
							<iconify-icon icon="material-symbols:grid-on-sharp" height="40" />
							<br /><span class="text-tertiary-500 dark:text-primary-500">{m.mediagallery_medium()}</span>
						</button>
					{:else}
						<button type="button" class="px-1 md:px-2" on:click={handleClick}>
							<iconify-icon icon="material-symbols:grid-view" height="40" />
							<br /><span class="text-tertiary-500 dark:text-primary-500">{m.mediagallery_large()}</span>
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>

	<!-- Grid display -->
	{#if view === 'grid'}
		<div class="flex flex-wrap items-center gap-4 overflow-auto">
			{#if filteredFiles.length === 0}
				<!-- Display a message when no media is found -->
				<div class="mx-auto text-center text-tertiary-500 dark:text-primary-500">
					<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2" />
					<p class="text-lg">{m.mediagallery_nomedia()}</p>
				</div>
			{:else}
				{#each filteredFiles as file, index}
					<div
						on:mouseenter={() => (showInfo[index] = true)}
						on:mouseleave={() => (showInfo[index] = false)}
						role="button"
						tabindex="0"
						class="card border border-surface-300 dark:border-surface-500"
					>
						<header class="m-2 flex w-auto items-center justify-between">
							<!-- Info Icon -->
							<button class="btn-icon" use:popup={FileTooltip}>
								<iconify-icon icon="raphael:info" width="24" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							</button>

							<!-- Popup Tooltip with the arrow element to show FileInfo -->
							<div class="card variant-filled z-50 min-w-[250px] p-2" data-popup="FileInfo">
								<table class="table-hover w-full table-auto">
									<thead class="text-tertiary-500">
										<tr class="divide-x divide-surface-400 border-b-2 border-surface-400 text-center">
											<th class="text-left">{m.mediagallery_Format()}</th>
											<th class="">{m.mediagallery_Pixel()}</th>
											<th class="">{m.mediagallery_size()}</th>
										</tr>
									</thead>
									<tbody>
										{#each orderedSizes as size}
											{#if file[size]}
												<!-- Check if file[size] is defined -->
												<tr class="divide-x divide-surface-400 border-b border-surface-400 last:border-b-0">
													<td class="font-bold text-tertiary-500">
														{size}
													</td>
													<td class="pr-1 text-right">
														{#if file[size].width && file[size].height}
															<!-- Check if width and height are defined -->
															{file[size].width}x{file[size].height}
														{:else}
															N/A <!-- Display N/A if width or height is not defined -->
														{/if}
													</td>
													<td class="text-right">
														{#if file[size].size}
															<!-- Check if size is defined -->
															{formatBytes(file[size].size)}
														{:else}
															N/A <!-- Display N/A if size is not defined -->
														{/if}
													</td>
												</tr>
											{/if}
										{/each}
									</tbody>
									<div class="variant-filled arrow" />
								</table>
							</div>
							<!--{#if showInfo[index]}-->
							<!-- Edit button -->
							<button class="btn-icon">
								<iconify-icon icon="mdi:pen" width="24" class="data:text-primary-500 text-tertiary-500" />
							</button>

							<!-- Delete button -->
							<button class="btn-icon" on:click={() => handleDeleteImage(file)}>
								<!-- Delete Icon -->
								<iconify-icon icon="icomoon-free:bin" width="24" class="text-error-500" />
							</button>
							<!--{/if}-->
						</header>

						<section class="p-2">
							<!-- Media File -->
							<img
								src={file.thumbnail.url}
								alt={file.thumbnail.name}
								class={`relative -top-4 left-0 ${gridSize === 'small' ? 'h-26 w-26' : gridSize === 'medium' ? 'h-48 w-48' : 'h-80 w-80'}`}
							/>
						</section>

						<footer class={`-mt-1 mb-3 text-center ${gridSize === 'small' ? 'text-xs' : 'text-base'}`}>
							{file.thumbnail.name}
						</footer>
					</div>
				{/each}
			{/if}
		</div>
	{:else}
		<!-- Table for table view -->
		<div class="table-container max-h-[calc(100vh-55px)] overflow-auto">
			<table
				class="table table-interactive table-hover ta{density === 'normal' || density === 'compact'
					? density === 'normal'
						? ''
						: 'table-compact'
					: 'table-comfortable'}"
			>
				<!-- Table Header -->
				<thead class="top-0 text-tertiary-500 dark:text-primary-500">
					<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">
						{#each tableHeaders as header}
							<th
								on:click={() => {
									//sorting
									sorting = {
										sortedBy: header.key,
										isSorted: (() => {
											if (header.key !== sorting.sortedBy) {
												return 1;
											}
											if (sorting.isSorted === 0) {
												return 1;
											} else if (sorting.isSorted === 1) {
												return -1;
											} else {
												return 0;
											}
										})()
									};
								}}
							>
								<div class="flex items-center justify-center text-center">
									{header.label}

									<iconify-icon
										icon="material-symbols:arrow-upward-rounded"
										width="22"
										class="origin-center duration-300 ease-in-out"
										class:up={sorting.isSorted === 1}
										class:invisible={sorting.isSorted == 0 || sorting.sortedBy != header.label}
									/>
								</div>
							</th>
						{/each}
					</tr>
				</thead>
				<tbody>
					{#each filteredFiles as file}
						<tr class="divide-x divide-surface-400">
							<td
								><!-- Media File -->
								<img
									src={file.thumbnail.url}
									alt={file.thumbnail.name}
									class={`relative -top-4 left-0 ${gridSize === 'small' ? 'h-32 w-auto' : gridSize === 'medium' ? 'h-48 w-44' : 'h-80 w-80'}`}
								/>
							</td>
							<td>{file.thumbnail.name}</td>
							<!-- <td>{formatBytes(file.size)}</td> -->
							<td>{file.hash}</td>
							<!-- <td>{file.path}</td> -->
						</tr>
					{/each}
				</tbody>
			</table>

			<!-- Pagination  -->
			<div class="text-token my-3 flex flex-col items-center justify-center md:flex-row md:justify-around">
				<div class="mb-2 md:mb-0">
					<span class="text-sm">{m.entrylist_page()}</span> <span class="text-tertiary-500 dark:text-primary-500">{currentPage}</span>
					<span class="text-sm"> {m.entrylist_of()} </span>
					<span class="text-tertiary-500 dark:text-primary-500">{Math.ceil(tableData.length / rowsPerPage)}</span>
				</div>

				<div class="variant-outline btn-group">
					<!-- First page -->
					<button
						type="button"
						class="btn"
						on:click={() => {
							currentPage = 1;
							refreshTableData();
						}}
					>
						<iconify-icon icon="material-symbols:first-page" width="24" class:disabled={currentPage === 1} />
					</button>

					<!-- Previous page -->
					<button
						type="button"
						class="btn"
						on:click={() => {
							currentPage = Math.max(1, currentPage - 1);
							refreshTableData();
						}}
					>
						<iconify-icon icon="material-symbols:chevron-left" width="24" class:disabled={currentPage === 1} />
					</button>

					<!-- Next page -->
					<button
						type="button"
						class="btn"
						on:click={() => {
							currentPage = Math.min(currentPage + 1, Math.ceil(tableData.length / rowsPerPage));
							refreshTableData();
						}}
					>
						<iconify-icon icon="material-symbols:chevron-right" width="24" class:active={currentPage === Math.ceil(tableData.length / rowsPerPage)} />
					</button>

					<!-- Last page -->
					<button
						type="button"
						class="btn"
						on:click={() => {
							currentPage = Math.ceil(tableData.length / rowsPerPage);
							refreshTableData();
						}}
					>
						<iconify-icon icon="material-symbols:last-page" width="24" class:disabled={currentPage === Math.ceil(tableData.length / rowsPerPage)} />
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>
