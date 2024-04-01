<script lang="ts">
	import PageTitle from '@components/PageTitle.svelte';
	import { formatSize } from '@utils/utils';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Buttons
	let globalSearchValue = '';
	let searchShow = false;
	let filterShow = false;
	let columnShow = false;
	let density = 'normal';

	//Get message from +page.server.ts
	export let errorMessage = '';

	//skeleton
	import { Avatar, filter } from '@skeletonlabs/skeleton';

	// Define the view, gridSize, and tableSize variables with the appropriate types
	let view: 'grid' | 'table' = 'grid';
	let gridSize: 'small' | 'medium' | 'large' = 'small';
	let tableSize: 'small' | 'medium' | 'large' = 'small';

	// Get the user's preferred view, grid size, and table size from local storage or a cookie
	let userPreference = getUserPreferenceFromLocalStorageOrCookie();
	if (userPreference) {
		let [preferredView, preferredGridSize, preferredTableSize] = userPreference.split('/');
		view = preferredView as 'grid' | 'table';
		gridSize = preferredGridSize as 'small' | 'medium' | 'large';
		tableSize = preferredTableSize as 'small' | 'medium' | 'large';
	}

	// Define a function to store the user's preferred view, grid size, and table size
	function storeUserPreference(view: 'grid' | 'table', gridSize: 'small' | 'medium' | 'large', tableSize: 'small' | 'medium' | 'large') {
		// Store the view, grid size, and table size for the current user in local storage or a cookie
		let userPreference = `${view}/${gridSize}/${tableSize}`;
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
		let userPreference = `${view}/${gridSize}/${tableSize}`;
		localStorage.setItem('GalleryUserPreference', userPreference);
	}

	function filterData(searchValue: any, data: any) {
		if (!searchValue) return data;

		return data.filter((item) => {
			// Define your filter logic here. For example, you might want to check if the item's name contains the searchValue.
			return item.name.toLowerCase().includes(searchValue.toLowerCase());
		});
	}

	export let data: {
		props: {
			data: {
				path: string;
				directory: string;
				name: string;
				size: number;
				thumbnail: string;
				hash: any;
			}[];
		};
	} = { props: { data: [] } };

	//console.log('Data received in component:', data);

	// Table
	let tableData: any[] = [];
	let filteredTableData: any[] = [];
	let filters: { [key: string]: string } = {};

	// Pagination
	let rowsPerPage = 10; // Set initial rowsPerPage value
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

			// Load All available Users
			responseData = data.props.data;

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

<div class="mb-2 flex items-center">
	<PageTitle name={m.mediagallery_pagetitle()} icon="bi:images" iconColor="text-tertiary-500 dark:text-primary-500" />
</div>
<div class="wrapper">
	<div class="mb-2 flex items-center justify-between gap-4">
		<!-- Search -->

		<div class="input-group input-group-divider grid grid-cols-[auto_1fr_auto]">
			<!-- TODO: fix search -->
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
						<br />Grid
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
						<br />Table
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
							<br />Small
						</button>
					{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
						<button type="button" class="px-1 md:px-2" on:click={handleClick}>
							<iconify-icon icon="material-symbols:grid-on-sharp" height="40" />
							<br />Medium
						</button>
					{:else}
						<button type="button" class="px-1 md:px-2" on:click={handleClick}>
							<iconify-icon icon="material-symbols:grid-view" height="40" /><br />Large
						</button>
					{/if}
				</div>
			</div>
		</div>
	</div>
	<!-- Render the error message if it exists -->
	{#if errorMessage}
		<p class="h2 text-center text-error-500">{errorMessage}</p>
	{:else if data.props.data.length === 0}
		<!-- Display a message when no media data is available -->
		<div class="text-center">
			<iconify-icon icon="bi:exclamation-circle-fill" height="64" class="mb-2 text-primary-500" />
			<p class="text-lg text-primary-500">{m.mediagallery_nomedia()}</p>
		</div>
	{:else}
		<!-- Grid display -->
		{#if view === 'grid'}
			<div class="mx-auto flex flex-wrap gap-2">
				{#each filterData(globalSearchValue, data.props.data) as image}
					<!-- Card -->
					<div
						class={`group card relative bg-transparent ${gridSize === 'small' ? 'card-small' : gridSize === 'medium' ? 'card-medium' : 'card-large'}`}
					>
						<!-- Edit/Delete Image -->
						<div class="absolute left-0 top-0 z-20 flex w-full justify-between p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
							<!-- Edit button -->
							<a href={`/imageEditor/${encodeURIComponent(image.path)}`}>
								<button class="variant-filled-tertiary btn-icon">
									<iconify-icon icon="mdi:pen" width="20" class="" />
								</button>
							</a>
							<!-- Delete button -->
							<button class="variant-filled-error btn-icon" on:click={() => handleDeleteImage(image)}>
								<!-- Delete Icon -->
								<iconify-icon icon="icomoon-free:bin" width="20" />
							</button>
						</div>

						<section class="relative border bg-white p-4 text-center dark:border-surface-500 dark:bg-surface-900">
							{#if image.thumbnail.endsWith('.jpg') || image.thumbnail.endsWith('.jpeg') || image.thumbnail.endsWith('.png') || image.thumbnail.endsWith('.svg') || image.thumbnail.endsWith('.webp') || image.thumbnail.endsWith('.avif')}
								<!-- SVG Image -->
								<img
									class={`inline-block object-cover object-center ${
										gridSize === 'small' ? 'h-16 w-16' : gridSize === 'medium' ? 'h-36 w-36' : 'h-80 w-80'
									}`}
									src={image.thumbnail}
									alt={image.name}
								/>
							{:else}
								<!-- Document icon -->
								<iconify-icon icon={image.thumbnail} width={gridSize === 'small' ? '58' : gridSize === 'medium' ? '138' : '315'} />
							{/if}
						</section>
						<footer
							class={`card-footer flex w-full flex-col items-center justify-center break-all  p-1 text-center text-xs dark:text-white`}
							style={`max-width: ${gridSize === 'small' ? '6rem' : gridSize === 'medium' ? '12rem' : '24rem'}`}
						>
							<div class="line-clamp-2 font-semibold dark:text-primary-500">{image.name}</div>
							<!-- <div class="line-clamp-1">{image.path}</div> -->
							<div class="line-clamp-1 text-tertiary-500">{formatSize(image.size)}</div>
							<div class="line-clamp-1">{image.hash}</div>
							<!-- <div class="">{image.thumbnail}</div> -->
						</footer>
					</div>
				{/each}
			</div>
		{:else}
			<!-- Table for table view -->
			<div class="table-container max-h-[calc(100vh-55px)] overflow-auto">
				<table
					class="table table-interactive table-hover ta{density === 'compact' ? 'table-compact' : density === 'normal' ? '' : 'table-comfortable'}"
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
									</div></th
								>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each filterData(globalSearchValue, data.props.data) as image}
							<tr class="divide-x divide-surface-400">
								<td
									><img
										class={`inline-block object-cover object-center ${
											gridSize === 'small' ? 'h-16 w-16' : gridSize === 'medium' ? 'h-36 w-36' : 'h-80 w-80'
										}`}
										src={image.thumbnail}
										alt={image.name}
									/></td
								>
								<td>{image.name}</td>
								<td>{formatSize(image.size)}</td>
								<td>{image.hash}</td>
								<td>{image.path}</td>
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
							<iconify-icon
								icon="material-symbols:chevron-right"
								width="24"
								class:active={currentPage === Math.ceil(tableData.length / rowsPerPage)}
							/>
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
	{/if}
</div>
