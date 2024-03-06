<script lang="ts">
	import axios from 'axios';
	import { asAny, debounce, getFieldName } from '@src/utils/utils';

	// Stores
	import { mode, entryData, modifyEntry, statusMap, contentLanguage, collection, categories } from '@src/stores/store';
	import { get, writable } from 'svelte/store';
	import { handleSidebarToggle, screenWidth, sidebarState, toggleSidebar } from '@src/stores/sidebarStore';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import TranslationStatus from './TranslationStatus.svelte';
	import TableIcons from './system/icons/TableIcons.svelte';
	import TanstackFilter from './system/tanstack/TanstackFilter.svelte';
	import FloatingInput from './system/inputs/floatingInput.svelte';
	import Loading from './Loading.svelte';
	import EntryListMultiButton from './EntryList_MultiButton.svelte';

	//svelte-dnd-action
	import { flip } from 'svelte/animate';
	import { slide } from 'svelte/transition';
	import { dndzone } from 'svelte-dnd-action';

	const flipDurationMs = 300;
	let columnOrder: string[] = []; // This will hold the order of your columns
	let columnVisibility: { [key: string]: boolean } = {}; // This will hold the visibility status of your columns

	function handleDndConsider(data: { items: { id: string; isVisible: boolean }[] }) {
		// No need to reassign the data object, directly access its items property
		const items = data.items;

		// You can potentially log or inspect the items here to understand the order before dropping
		console.log('Items before dropping:', items);
	}

	function handleDndFinalize(data: { items: { id: string; isVisible: boolean }[] }) {
		const clickedColumn = data.items[0].id; // Assuming the first item is the clicked/dragged column

		// Update sorting for the clicked column (toggle sort or change field)
		sorting[clickedColumn] = {
			sortedBy: getFieldName($collection.fields.find((field) => field.label === clickedColumn)), // Get field name for clicked column
			isSorted: sorting[clickedColumn]?.isSorted === 1 ? -1 : 1 // Toggle sort direction
		};

		// Refresh data with the updated sorting
		refresh();
	}

	let isLoading = false;
	let loadingTimer: any; // recommended time of around 200-300ms

	//Buttons
	let globalSearchValue = '';
	let searchShow = false;
	let filterShow = false;
	let columnShow = false;

	// Retrieve density from local storage or set to 'normal' if it doesn't exist
	let density = localStorage.getItem('density') || 'normal';

	let data: { entryList: [any]; pagesCount: number } | undefined;
	let tableHeaders: Array<{ label: string; name: string }> = [];
	let tableData: any[] = [];
	let modifyMap: { [key: string]: boolean } = {};

	// Tick row logic
	let SelectAll = false;
	let selectedMap = writable({});

	// Filter
	let filters: { [key: string]: string } = {}; // Set initial filters object
	let waitFilter = debounce(300); // Debounce filter function for 300ms

	// Pagination
	let rowsPerPage = 10; // Set initial rowsPerPage value
	let currentPage = 1; // Set initial currentPage value

	// This function handles changes in the dropdown (assuming it has a class 'select')
	function rowsPerPageHandler(event: any) {
		rowsPerPage = parseInt(event.target.value); // Update rowsPerPage with the selected value
		refresh(); // Trigger data refresh with the new rowsPerPage
	}

	// This function refreshes the data displayed in a table by fetching new data from an API endpoint and updating the tableData and options variables.
	async function refresh(fetch = true) {
		// Clear loading timer
		loadingTimer && clearTimeout(loadingTimer);

		// If the collection name is empty, return
		if ($collection.name == '') return;

		// If fetch is true, set isLoading to true
		if (fetch) {
			// Set loading to true
			loadingTimer = setTimeout(() => {
				isLoading = true;
			}, 400);

			// Fetch data from API endpoint
			data = (await axios
				.get(
					`/api/${$collection.name}?page=${currentPage}&length=${rowsPerPage}&filter=${JSON.stringify(filters)}&sort=${JSON.stringify(
						sorting.isSorted
							? {
									[sorting.sortedBy]: sorting.isSorted
								}
							: {}
					)}`
				)
				.then((data) => data.data)) as { entryList: [any]; pagesCount: number };

			// Set loading to false
			isLoading = false;
			clearTimeout(loadingTimer);
		}

		// Update tableData and options
		data &&
			(tableData = await Promise.all(
				data.entryList.map(async (entry) => {
					let obj: { [key: string]: any } = {};
					for (let field of $collection.fields) {
						if ('callback' in field) {
							field.callback({ data });
							handleSidebarToggle();
						}
						obj[field.label] = await field.display?.({
							data: entry[getFieldName(field)],
							collection: $collection.name,
							field,
							entry,
							contentLanguage: $contentLanguage
						});
					}
					obj._id = entry._id;
					return obj;
				})
			));

		// Update tableHeaders
		tableHeaders = $collection.fields.map((field) => ({ label: field.label, name: getFieldName(field) }));

		selectedMap = {};
		SelectAll = false;
	}

	// Trigger refresh based on collection, filters, sorting, and currentPage
	$: {
		refresh();
		$collection;
		filters;
		sorting;
		currentPage;
	}
	// Trigger refresh when contentLanguage changes, but don't fetch data
	$: {
		refresh(false);
		$contentLanguage;
		filters = {};
	}
	// Reset currentPage to 1 when the collection changes
	$: {
		currentPage = 1;
		$collection;
	}

	// Tick  All Rows
	function process_selectAll(selectAll: boolean) {
		if (selectAll) {
			for (let item in tableData) {
				selectedMap[item] = true;
			}
		} else {
			for (let item in selectedMap) {
				selectedMap[item] = false;
			}
		}
	}

	//Update Tick All Rows
	//$: process_selectAll(SelectAll);
	$: Object.values(selectedMap).includes(true) ? mode.set('delete') : mode.set('view');

	// Columns Sorting
	let sorting: { sortedBy: string; isSorted: 0 | 1 | -1 } = {
		sortedBy: getFieldName($collection.fields[0]), // set the first column as default
		isSorted: 1 // 1 for ascending order, -1 for descending order and 0 for not sorted
	};

	// Initialize columnOrder and columnVisibility
	$: {
		columnOrder = $collection.fields.map((field) => getFieldName(field));
		columnVisibility = $collection.fields.reduce((acc, field) => {
			acc[getFieldName(field)] = true;
			return acc;
		}, {});
	}

	// Store values in local storage
	$: {
		localStorage.setItem('density', density);
		localStorage.setItem('sorting', JSON.stringify(sorting));
		localStorage.setItem('currentPage', JSON.stringify(currentPage));
		localStorage.setItem('rowsPerPage', JSON.stringify(rowsPerPage));
		localStorage.setItem('filters', JSON.stringify(filters));
		localStorage.setItem('columnOrder', JSON.stringify(columnOrder));
		localStorage.setItem('columnVisibility', JSON.stringify(columnVisibility));
	}

	// Tick Row - modify STATUS of an Entry
	$modifyEntry = async (status: keyof typeof statusMap) => {
		console.log('modifyEntry called', modifyEntry, statusMap[status]);
		// Initialize an array to store the IDs of the items to be modified
		let modifyList: Array<string> = [];
		// Loop over the selectedMap object
		for (let item in modifyMap) {
			console.log(tableData[item]);
			// If the item is ticked, add its ID to the modifyList
			selectedMap[item] && modifyList.push(tableData[item]._id);
		}
		// Initialize a new FormData object
		if (modifyList.length == 0) return;
		// Initialize a new FormData object
		let formData = new FormData();
		// Append the IDs of the items to be modified to formData
		formData.append('ids', JSON.stringify(modifyList));
		// Append the status to formData
		formData.append('status', statusMap[status]);
		// Use the status to determine which API endpoint to call and what HTTP method to use
		switch (status) {
			case 'delete':
				// If the status is 'Delete', call the delete endpoint
				await axios.delete(`/api/${$collection.name}`, { data: formData });
				break;
			case 'publish':
			case 'unpublish':
			case 'test':
				// If the status is 'Publish', 'Unpublish', 'Schedule', or 'Clone', call the patch endpoint
				await axios.patch(`/api/${$collection.name}/setStatus`, formData).then((res) => res.data);
				break;
			case 'clone':
				await axios.post(`/api/${$collection.name}/clone`, formData);
				break;
			case 'schedule':
				await axios.post(`/api/${$collection.name}/schedule`, formData);
				break;
		}
		// Refresh the collection
		refresh();
		// Set the mode to 'view'
		mode.set('view');
	};
</script>

<!--sTable -->
{#if isLoading}
	<Loading />
{:else}
	<!-- Header -->
	<div class="mb-2 flex justify-between dark:text-white">
		<!-- Row 1 for Mobile -->
		<div class="flex items-center justify-between">
			<!-- Hamburger -->
			{#if $sidebarState.left === 'hidden'}
				<button
					type="button"
					on:keydown
					on:click={() => toggleSidebar('left', get(screenWidth) === 'desktop' ? 'full' : 'collapsed')}
					class="variant-ghost-surface btn-icon mt-1"
				>
					<iconify-icon icon="mingcute:menu-fill" width="24" />
				</button>
			{/if}
			<!-- Collection type with icon -->
			<!-- TODO: Translate Collection Name -->
			<div class="mr-1 flex flex-col {!$sidebarState.left ? 'ml-2' : 'ml-1 sm:ml-2'}">
				{#if $categories.length}<div class="mb-2 text-xs capitalize text-surface-500 dark:text-surface-300 rtl:text-left">
						{$categories[0].name}
					</div>{/if}
				<div class="-mt-2 flex justify-start text-sm font-bold uppercase dark:text-white md:text-2xl lg:text-xl">
					{#if $collection.icon}<span> <iconify-icon icon={$collection.icon} width="24" class="mr-1 text-error-500 sm:mr-2" /></span>{/if}
					{#if $collection.name}
						<div class="flex max-w-[65px] whitespace-normal leading-3 sm:mr-2 sm:max-w-none md:mt-0 md:leading-none xs:mt-1">
							{$collection.name}
						</div>
					{/if}
				</div>
			</div>
		</div>

		<button type="button" on:keydown on:click={() => (searchShow = !searchShow)} class="variant-ghost-surface btn-icon sm:hidden">
			<iconify-icon icon="material-symbols:filter-list-rounded" width="30" />
		</button>
		<div class="relative hidden items-center justify-center gap-2 sm:flex">
			<TanstackFilter bind:globalSearchValue bind:filterShow bind:columnShow bind:density />
			<TranslationStatus />
		</div>
		<!-- MultiButton -->
		<EntryListMultiButton />
	</div>

	<!-- Table -->
	{#if tableData.length > 0}
		{#if columnShow}
			<!-- column order -->
			<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 text-center dark:bg-surface-700">
				<div class="text-white dark:text-primary-500">Drag & Drop Columns / Click to hide</div>
				<!-- all -->
				<div class="my-2 flex w-full items-center justify-center gap-1">
					<label class="mr-3">
						<input type="checkbox" bind:checked={SelectAll} />
						{m.entrylist_all()}
					</label>

					<section
						use:dndzone={{ items: columnOrder, flipDurationMs }}
						on:consider={handleDndConsider}
						on:finalize={handleDndFinalize}
						class="flex flex-wrap justify-center gap-1 rounded-md p-2"
					>
						{#each columnOrder as columnName (columnName)}
							<button
								class="chip {columnVisibility[columnName]
									? 'variant-filled-secondary'
									: 'variant-ghost-secondary'} w-100 mr-2 flex items-center justify-center"
								animate:flip={{ duration: flipDurationMs }}
								on:click={() => {
									columnVisibility[columnName] = !columnVisibility[columnName];

									// Save to local storage
									localStorage.setItem('columnVisibility', JSON.stringify(columnVisibility));
								}}
							>
								{#if columnVisibility[columnName]}
									<span><iconify-icon icon="fa:check" /></span>
								{/if}
								<span class="ml-2 capitalize">{columnName}</span>
							</button>
						{/each}
					</section>
				</div>
			</div>
		{/if}

		<div class="table-container max-h-[calc(100vh-55px)] overflow-auto">
			<table class="table table-interactive table-hover {density === 'compact' ? 'table-compact' : density === 'normal' ? '' : 'table-comfortable'}">
				<!-- Table Header -->
				<thead class="top-0 text-tertiary-500 dark:text-primary-500">
					{#if filterShow}
						<tr class="divide-x divide-surface-400">
							<th>
								<!-- blank -->
							</th>

							<!-- Filter -->
							{#each tableHeaders as header}
								<th>
									<div class="flex items-center justify-between">
										<FloatingInput
											type="text"
											icon="material-symbols:search-rounded"
											label="Filter ..."
											name={header.name}
											on:input={(e) => {
												let value = asAny(e.target).value;
												if (value) {
													waitFilter(() => {
														filters[header.name] = value;
													});
												} else {
													delete filters[header.name];
													filters = filters;
												}
											}}
										/>
									</div>
								</th>
							{/each}
						</tr>
					{/if}

					<tr class="divide-x divide-surface-400 border-b border-black dark:border-white">
						<th class="!pl-[15px]">
							<TableIcons bind:checked={SelectAll} on:change={() => process_selectAll(SelectAll)} />
						</th>
						{#each tableHeaders as header}
							<th
								on:click={() => {
									//sorting
									sorting = {
										sortedBy: header.name,
										isSorted: (() => {
											if (header.name !== sorting.sortedBy) {
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
					{#each tableData as row, index}
						<tr
							class={`${
								data?.entryList[index]?.status == 'unpublished' ? '!bg-yellow-700' : data?.entryList[index]?.status == 'testing' ? 'bg-red-800' : ''
							} divide-x  divide-surface-400`}
							on:click={() => {
								entryData.set(data?.entryList[index]);
								//console.log(data)
								mode.set('edit');
								handleSidebarToggle();
							}}
						>
							<td class="!pl-[10px]">
								<TableIcons
									on:change={() => {
										selectedMap.update((map) => ({ ...map, [row.id]: !map[row.id] }));
										mode.set('edit');
										handleSidebarToggle();
									}}
									class="ml-1"
								/>
							</td>

							{#each tableHeaders as header}
								<td class="text-center font-bold">
									{@html row[header.label]}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>

			<!-- Pagination  -->
			<div class="text-token my-3 flex flex-col items-center justify-center md:flex-row md:justify-around">
				<div class="mb-2 md:mb-0">
					<span class="text-sm">{m.entrylist_page()}</span> <span class="text-tertiary-500 dark:text-primary-500">{currentPage}</span>
					<span class="text-sm"> {m.entrylist_of()} </span> <span class="text-tertiary-500 dark:text-primary-500">{data?.pagesCount || 0}</span>
				</div>

				<div class="variant-outline btn-group">
					<!-- first page -->
					<button
						type="button"
						class="btn"
						on:click={() => {
							currentPage = 1;
							refresh();
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
							refresh();
						}}
					>
						<iconify-icon icon="material-symbols:chevron-left" width="24" class:disabled={currentPage === 1} />
					</button>

					<!-- number of pages -->
					<select
						value={rowsPerPage}
						on:change={rowsPerPageHandler}
						class="mt-0.5 bg-transparent text-center text-tertiary-500 dark:text-primary-500"
					>
						{#each [10, 25, 50, 100, 500] as pageSize}
							<option value={pageSize}> {pageSize} {m.entrylist_rows()} </option>
						{/each}
					</select>

					<!-- Next page -->
					<button
						type="button"
						class="btn"
						on:click={() => {
							currentPage = Math.min(currentPage + 1, data?.pagesCount || 0);
							refresh();
						}}
					>
						<iconify-icon icon="material-symbols:chevron-right" width="24" class:active={currentPage === data?.pagesCount} />
					</button>

					<!-- Last page -->
					<button
						type="button"
						class="btn"
						on:click={() => {
							currentPage = data?.pagesCount || 0;
							refresh();
						}}
					>
						<iconify-icon icon="material-symbols:last-page" width="24" class:disabled={currentPage === data?.pagesCount} />
					</button>
				</div>
			</div>
		</div>
	{:else}
		<!-- Display a message when no data is yet available -->
		<div class="text-center">
			<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2 text-primary-500" />
			<p class="text-lg text-primary-500">No {$collection.name} Data</p>
		</div>
	{/if}
{/if}

<style lang="postcss">
	.up {
		transform: rotate(-180deg);
	}
	div::-webkit-scrollbar-thumb {
		border-radius: 50px;
		background-color: #0eb4c4;
	}
	div::-webkit-scrollbar {
		width: 10px;
	}
</style>
