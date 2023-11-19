<script lang="ts">
	import PageTitle from '@src/components/PageTitle.svelte';
	import TanstackTable from '@src/components/TanstackTable.svelte';
	import { formatSize } from '@src/utils/utils';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// TanstackFilter
	import TanstackFilter from '@src/components/TanstackFilter.svelte';
	let globalSearchValue = '';
	let searchShow = false;
	let filterShow = false;
	let columnShow = false;
	let density = 'normal';

	//Get message from +page.server.ts
	export let errorMessage = '';
	//console.log('error', errorMessage);

	//skeleton
	import { Avatar } from '@skeletonlabs/skeleton';
	import { flexRender } from '@tanstack/svelte-table';

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

	function filterData(searchValue, data) {
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

	//TODO: fix tanstack office icons display

	// Column Definition
	let items = [
		{
			header: 'Image',
			accessorKey: 'image',
			id: 'image',
			cell: (info: any) => {
				if (info.row.original.path.endsWith('.pdf')) {
					// PDF icon
					return '<iconify-icon icon="vscode-icons:file-type-pdf2" height="42" />';
				} else if (info.row.original.path.endsWith('.xlsx') || info.row.original.path.endsWith('.xls')) {
					// Excel icon
					return '<iconify-icon icon="vscode-icons:file-type-excel" height="42" />';
				} else if (info.row.original.path.endsWith('.docx') || info.row.original.path.endsWith('.doc')) {
					// Word icon
					return '<iconify-icon icon="vscode-icons:file-type-word" height="42" />';
				} else {
					// Default case
					return flexRender(Avatar, {
						src: info.row.original.thumbnail,
						width: `${tableSize === 'small' ? 'w-6' : tableSize === 'medium' ? 'w-10' : 'w-14'}`
					});
				}
			}
		},
		{
			header: 'Name',
			accessorKey: 'name',
			id: 'name',
			cell: (info: any) => info.row.original.name // Display the name without the hash
		},
		{
			header: 'Size',
			accessorKey: 'size',
			id: 'size',
			cell: (info: any) => {
				return formatSize(info.row.original.size);
			}
		},
		{
			header: 'Hash',
			accessorKey: 'hash',
			id: 'hash',
			cell: (info: any) => info.row.original.hash // Display the hash value
		},
		{
			header: 'Path',
			accessorKey: 'path',
			id: 'path',
			cell: (info: any) => `${info.row.original.path}-${info.row.original.name}` // Construct full path
		}
	];

	//Todo: Check if media is used in a collection before delete is possible
	async function handleDeleteImage(image) {
		try {
			const response = await fetch(`/api/deleteImage/${encodeURIComponent(image.thumbnail)}`, {
				method: 'DELETE'
			});

			if (response.ok) {
				// Image was successfully deleted
				// You might want to update the data array to reflect the deletion
				// Example: setData(data.filter(item => item.thumbnail !== image.thumbnail));
			} else {
				// Handle error
				console.error('Error deleting image:', response.statusText);
			}
		} catch (error) {
			console.error('Error deleting image:', error);
		}
	}
</script>

<div class="flex flex-col gap-1">
	<PageTitle name={m.mediagallery_pagetitle()} icon="bi:images" iconColor="text-primary-500" />

	<div class="flex items-center justify-between">
		<!-- Search -->
		<div>
			<TanstackFilter bind:globalSearchValue bind:searchShow bind:filterShow bind:columnShow bind:density />
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
								<iconify-icon icon="material-symbols:grid-view-rounded" height="42" style={`color: white`} />
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
								<iconify-icon icon="material-symbols:list-alt-outline" height="44" style={`color: white`} />

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
					<div class="flex divide-x divide-surface-500">
						{#if (view === 'grid' && gridSize === 'small') || (view === 'table' && tableSize === 'small')}
							<button type="button" class="px-1" on:click={handleClick}>
								<iconify-icon icon="material-symbols:background-grid-small-sharp" height="40" style={`color: white`} />
								<p class="text-xs">{m.mediagallery_small()}</p>
							</button>
						{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
							<button type="button" class="px-1" on:click={handleClick}>
								<iconify-icon icon="material-symbols:grid-on-sharp" height="40" style={`color: white`} />
								<p class="text-xs">{m.mediagallery_medium()}</p>
							</button>
						{:else}
							<button type="button" class="px-1" on:click={handleClick}>
								<iconify-icon icon="material-symbols:grid-view" height="40" style={`color: white`} />
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
						<iconify-icon icon="material-symbols:grid-view-rounded" height="40" style={`color: ${view === 'grid' ? 'white' : 'grey'}`} />
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
						<iconify-icon icon="material-symbols:list-alt-outline" height="40" style={`color: ${view === 'table' ? 'white' : 'grey'}`} />
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
							<iconify-icon icon="material-symbols:background-grid-small-sharp" height="40" style={`color: white`} />
							<br />Small
						</button>
					{:else if (view === 'grid' && gridSize === 'medium') || (view === 'table' && tableSize === 'medium')}
						<button type="button" class="px-1 md:px-2" on:click={handleClick}>
							<iconify-icon icon="material-symbols:grid-on-sharp" height="40" style={`color: white`} />
							<br />Medium
						</button>
					{:else}
						<button type="button" class="px-1 md:px-2" on:click={handleClick}>
							<iconify-icon icon="material-symbols:grid-view" height="40" style={`color: white`} /><br />Large
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
			<p class="text-lg text-primary-500">No media files available.</p>
		</div>
	{:else}
		<!-- Grid display -->
		{#if view === 'grid'}
			<div class="mx-auto flex flex-wrap gap-2">
				{#each filterData(globalSearchValue, data.props.data) as image}
					<div class={`group card relative ${gridSize === 'small' ? 'card-small' : gridSize === 'medium' ? 'card-medium' : 'card-large'}`}>
						<!-- Edit/Delete Image -->
						<div class="absolute left-0 top-0 z-20 flex w-full justify-between p-2 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
							<!-- Edit button -->
							<a href={`/imageEditor/${encodeURIComponent(image.thumbnail)}/edit`}>
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
						<section class="relative p-4 text-center">
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
							class={`card-footer mt-1 flex w-full items-center justify-center break-all rounded-sm bg-white p-0 text-center text-xs dark:bg-surface-600 dark:text-white`}
							style={`max-width: ${gridSize === 'small' ? '6rem' : gridSize === 'medium' ? '12rem' : '24rem'}`}
						>
							<div class="flex-col">
								<div class="mb-1 line-clamp-2 font-semibold text-primary-500">{image.name}</div>
								<!-- <div class="line-clamp-1">{image.path}</div> -->
								<div class="line-clamp-1 text-tertiary-500">{formatSize(image.size)}</div>
								<div class="line-clamp-1">{image.hash}</div>
								<!-- <div class="">{image.thumbnail}</div> -->
							</div>
						</footer>
					</div>
				{/each}
			</div>
		{:else}
			<!-- TanstackTable for table view -->
			<TanstackTable
				data={data.props.data}
				{items}
				tableData={data.props.data}
				dataSourceName="MediaGallery"
				bind:globalSearchValue
				bind:filterShow
				bind:columnShow
				bind:density
			/>
		{/if}
	{/if}
</div>
