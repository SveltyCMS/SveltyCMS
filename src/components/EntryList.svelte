<script lang="ts">
	import axios from 'axios';
	import { asAny, debounce, getFieldName, meta_data } from '@src/utils/utils';

	// Stores
	import { get } from 'svelte/store';
	import { mode, entryData, modifyEntry, statusMap, contentLanguage, collection, categories, systemLanguage } from '@src/stores/store';
	import { handleSidebarToggle, screenWidth, sidebarState, toggleSidebar } from '@src/stores/sidebarStore';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Components
	import EntryListMultiButton from './EntryList_MultiButton.svelte';
	import TranslationStatus from '@components/TranslationStatus.svelte';
	import TableIcons from '@src/components/system/table/TableIcons.svelte';
	import TableFilter from '@components/system/table/TableFilter.svelte';
	import FloatingInput from '@components/system/inputs/floatingInput.svelte';
	import TablePagination from '@components/system/table/TablePagination.svelte';

	import Status from '@components/system/table/Status.svelte';
	import Loading from './Loading.svelte';

	// Skeleton
	import { getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings } from '@skeletonlabs/skeleton';
	const toastStore = getToastStore();
	const modalStore = getModalStore();

	// Svelte-dnd-action
	import { flip } from 'svelte/animate';
	import { dndzone } from 'svelte-dnd-action';

	const flipDurationMs = 300;

	function handleDndConsider(event: CustomEvent<{ items: any[] }>) {
		displayTableHeaders = event.detail.items;
	}

	function handleDndFinalize(event: CustomEvent<{ items: any[] }>) {
		displayTableHeaders = event.detail.items;
	}

	let isLoading = false;
	let loadingTimer: any; // recommended time of around 200-300ms

	// Buttons
	let globalSearchValue = '';
	let expand = false;
	let filterShow = false;
	let columnShow = false;

	// Retrieve entryListPaginationSettings from local storage or set default values for each collection
	const entryListPaginationSettingsKey = `entryListPaginationSettings_${$collection.name}`;
	let entryListPaginationSettings: any = localStorage.getItem(entryListPaginationSettingsKey)
		? JSON.parse(localStorage.getItem(entryListPaginationSettingsKey) as string)
		: {
				collectionName: $collection.name,
				density: 'normal',
				sorting: { sortedBy: '', isSorted: 0 },
				currentPage: 1,
				rowsPerPage: 10,
				filters: {},
				displayTableHeaders: []
			};

	let density: string = entryListPaginationSettings.density || 'normal'; // Retrieve density from local storage or set to 'normal' if it doesn't exist
	let selectAllColumns = true; // Initialize to true to show all columns by default

	let data: { entryList: [any]; pagesCount: number } | undefined;
	let tableHeaders: Array<{ label: string; name: string }> = [];
	let tableData: any[] = [];

	// Initialize displayTableHeaders with the values from entryListPaginationSettings or default to tableHeaders
	let displayTableHeaders: { label: string; name: string; id: string; visible: boolean }[] =
		entryListPaginationSettings.displayTableHeaders.length > 0
			? entryListPaginationSettings.displayTableHeaders
			: tableHeaders.map((header) => ({ ...header, visible: true }));

	// Tick row logic
	let SelectAll = false;
	const selectedMap: { [key: string]: boolean } = {};

	// Filter
	let filters: { [key: string]: string } = entryListPaginationSettings.filters || {};
	const waitFilter = debounce(300); // Debounce filter function for 300ms

	// Pagination
	let pagesCount: number = entryListPaginationSettings.pagesCount || 1; // Initialize pagesCount
	let currentPage: number = entryListPaginationSettings.currentPage || 1; // Set initial currentPage value
	let rowsPerPage: number = entryListPaginationSettings.rowsPerPage || 10; // Set initial rowsPerPage value
	const rowsPerPageOptions = [5, 10, 25, 50, 100, 500]; // Set initial rowsPerPage value options

	// Declare isFirstPage and isLastPage variables
	let isFirstPage: boolean;
	let isLastPage: boolean;

	// Define the rowsPerPageHandler function
	function rowsPerPageHandler(event: Event) {
		// Get the selected value from the event
		const selectedValue = (event.target as HTMLSelectElement).value;
		// Update the rows per page value
		rowsPerPage = parseInt(selectedValue); // Assuming rowsPerPage is a number
		// Optionally, you can call the refreshTableData function here if needed
		refreshTableData();
	}

	// This function refreshes the data displayed in a table by fetching new data from an API endpoint and updating the tableData and options variables.
	async function refreshTableData(fetch = true) {
		//console.log('refreshTableData called');
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
					)}&search=${globalSearchValue}`
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
					const obj: { [key: string]: any } = {};

					for (const field of $collection.fields) {
						if ('callback' in field) {
							field.callback({ data });
							handleSidebarToggle();
						}

						// Status
						// TODO: Add Localized status states, Pay attention to Status.svelte modifier
						//obj.status = entry.status ? m.status_(obj.status) : 'N/A';
						obj.status = entry.status ? entry.status.charAt(0).toUpperCase() + entry.status.slice(1) : 'N/A';
						//Collection fields
						obj[field.label] = await field.display?.({
							data: entry[getFieldName(field)],
							collection: $collection.name,
							field,
							entry,
							contentLanguage: $contentLanguage
						});
					}

					// Add createdAt and updatedAt properties localized to the system language
					obj.createdAt = entry.createdAt ? new Date(entry.createdAt).toLocaleString($systemLanguage) : 'N/A';
					obj.updatedAt = entry.updatedAt ? new Date(entry.updatedAt).toLocaleString($systemLanguage) : 'N/A';
					obj._id = entry._id; // Add _id property

					return obj;
				})
			));

		// For rending Table data
		tableHeaders = $collection.fields.map((field) => ({ label: field.label, name: getFieldName(field) }));
		tableHeaders.push({ label: 'createdAt', name: 'createdAt' }, { label: 'updatedAt', name: 'updatedAt' }, { label: 'status', name: 'status' });

		// Update displayTableHeaders based on entryListPaginationSettings
		if (entryListPaginationSettings.displayTableHeaders.length > 0) {
			displayTableHeaders = entryListPaginationSettings.displayTableHeaders.map((header) => ({
				...header,
				id: crypto.randomUUID() // Add unique id for each header (optional)
			}));
		} else if (tableHeaders.length > 0) {
			// If no saved settings, use tableHeaders with initial visibility
			displayTableHeaders = tableHeaders.map((header) => ({
				...header,
				visible: true, // Assuming all columns are initially visible
				id: crypto.randomUUID() // Add unique id for each header (optional)
			}));
		}

		SelectAll = false;

		// Update pagesCount after fetching data
		pagesCount = data?.pagesCount || 1;

		// Update isFirstPage and isLastPage based on currentPage and pagesCount
		isFirstPage = currentPage === 1;
		isLastPage = currentPage === pagesCount;

		// Adjust currentPage to the last page if it exceeds the new total pages count after changing the rows per page.
		if (currentPage > (data?.pagesCount || 0)) {
			currentPage = data?.pagesCount || 1;
		}
	}

	// React to changes in density setting and update local storage for each collection
	$: {
		entryListPaginationSettings = {
			...entryListPaginationSettings,
			collectionName: $collection.name,
			filters,
			sorting,
			density,
			currentPage,
			rowsPerPage,
			displayTableHeaders
		};
		localStorage.setItem(entryListPaginationSettingsKey, JSON.stringify(entryListPaginationSettings)); // Update local storage using the entryListPaginationSettingsKey
	}

	$: {
		tableHeaders = displayTableHeaders.filter((header) => header.visible);
	}

	// Trigger refreshTableData based on collection, filters, sorting, and currentPage
	$: {
		refreshTableData();
		$collection;
		filters;
		sorting;
		currentPage;
	}
	// Trigger refreshTableData when contentLanguage changes, but don't fetch data
	$: {
		refreshTableData(false);
		filters = {};
		$contentLanguage;
	}
	// Reset currentPage to 1 when the collection changes
	$: {
		currentPage = 1;
		$collection;
	}

	// Tick  All Rows
	function process_selectAll(selectAll: boolean) {
		if (selectAll) {
			// Iterate only over visible entries
			for (const item in tableData) {
				selectedMap[item] = true;
			}
		} else {
			// Clear all selections
			for (const item in selectedMap) {
				selectedMap[item] = false;
			}
		}
	}

	// Update Tick All Rows
	$: process_selectAll(SelectAll);

	// Update Tick Single Row
	$: Object.values(selectedMap).includes(true) ? mode.set('modify') : mode.set('view');

	// Reset entryData when mode changes
	mode.subscribe(() => {
		meta_data.clear();
		if ($mode == 'view') {
			entryData.set({});
		}
	});

	// Columns Sorting
	let sorting: { sortedBy: string; isSorted: 0 | 1 | -1 } = localStorage.getItem('sorting')
		? JSON.parse(localStorage.getItem('sorting') as string)
		: {
				sortedBy: tableData.length > 0 ? Object.keys(tableData[0])[0] : '', // Set default sortedBy based on first key in tableData (if available)
				isSorted: 1 // 1 for ascending order, -1 for descending order and 0 for not sorted
			};

	// Tick Row - modify STATUS of an Entry
	$modifyEntry = async (status: keyof typeof statusMap) => {
		// Initialize an array to store the IDs of the items to be modified
		const modifyList: Array<string> = [];
		// Loop over the selectedMap object
		for (const item in selectedMap) {
			// If the item is ticked, add its ID to the modifyList
			selectedMap[item] && modifyList.push(tableData[item]._id);
		}
		// If no rows are selected, return
		if (modifyList.length === 0) return;

		// Function to handle confirmation modal response
		const handleConfirmation = async (confirm: boolean) => {
			if (!confirm) return;

			// Initialize a new FormData object
			const formData = new FormData();
			// Append the IDs of the items to be modified to formData
			formData.append('ids', JSON.stringify(modifyList));
			// Append the status to formData
			formData.append('status', statusMap[status]);

			try {
				// Call the appropriate API endpoint based on the status
				switch (status) {
					case 'delete':
						// If the status is 'Delete', call the delete endpoint
						await axios.delete(`/api/${$collection.name}`, { data: formData });
						break;
					case 'publish':
					case 'unpublish':
					case 'test':
						// If the status is 'Publish', 'Unpublish', 'Schedule', or 'Clone', call the patch endpoint
						await axios.patch(`/api/${$collection.name}/setStatus`, formData);
						break;
					case 'clone':
					case 'schedule':
						// Trigger a toast message indicating that the feature is not yet implemented
						const toast = {
							message: 'Feature not yet implemented.',
							background: 'variant-filled-error',
							timeout: 3000
						};
						toastStore.trigger(toast);
						break;
				}

				// Refresh the collection
				refreshTableData();
				// Set the mode to 'view'
				mode.set('view');
			} catch (error) {
				console.error('Error:', error);
				// Optionally handle error scenarios
			}
		};

		// If more than one row is selected or the status is 'delete', show confirmation modal
		if (modifyList.length > 1 || status === 'delete') {
			const modalData: ModalSettings = {
				type: 'confirm',
				title: m.entrylist_title(),
				body: m.entrylist_body({
					status: `<span class="text-text-tertiary-500 dark:text-primary-500">${status.charAt(0).toUpperCase()}${status.slice(1)}</span>`
				}),
				buttonTextCancel: m.button_cancel(),
				buttonTextConfirm: m.button_confirm(),
				response: handleConfirmation
			};

			modalStore.trigger(modalData); // Trigger the confirmation modal
		} else {
			// If only one row is selected and status is not 'delete', directly proceed with modification
			handleConfirmation(true);
		}
	};
</script>

<!--Table -->
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
					</div>
				{/if}
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

		<!-- Expand/Collapse -->
		<button type="button" on:keydown on:click={() => (expand = !expand)} class="variant-ghost-surface btn-icon mt-1 sm:hidden">
			<iconify-icon icon="material-symbols:filter-list-rounded" width="30" />
		</button>

		<!-- Content Language -->
		<div class="mt-1 sm:hidden">
			<TranslationStatus />
		</div>

		<!-- Table Filter -->
		<div class="relative mt-1 hidden items-center justify-center gap-2 sm:flex">
			<TableFilter bind:globalSearchValue bind:filterShow bind:columnShow bind:density />
			<TranslationStatus />
		</div>
		<!-- MultiButton -->
		<EntryListMultiButton />
	</div>

	<!-- Table -->
	{#if tableData.length > 0}
		{#if expand}
			<div class="mb-2 flex items-center justify-center">
				<TableFilter bind:globalSearchValue bind:filterShow bind:columnShow bind:density />
			</div>
		{/if}

		{#if columnShow}
			<!-- Column order -->
			<div class="rounded-b-0 flex flex-col justify-center rounded-t-md border-b bg-surface-300 text-center dark:bg-surface-700">
				<div class="text-white dark:text-primary-500">
					{m.entrylist_dnd()}
				</div>
				<!-- Select All Columns -->
				<div class="my-2 flex w-full items-center justify-center gap-1">
					<div class="flex- items-center justify-between">
						<label class="mr-2">
							<input
								type="checkbox"
								bind:checked={selectAllColumns}
								on:change={() => {
									// Check if all columns are currently visible
									const allColumnsVisible = displayTableHeaders.every((header) => header.visible);

									// Toggle visibility of all columns based on the current state of selectAllColumns
									displayTableHeaders = displayTableHeaders.map((header) => ({
										...header,
										visible: !allColumnsVisible
									}));

									// Update selectAllColumns based on the new visibility state of all columns
									selectAllColumns = !allColumnsVisible;
								}}
							/>
							{m.entrylist_all()}
						</label>

						<!-- Clear local storage and reload tableHeader -->
						<button
							class="btn"
							on:click={() => {
								// Remove the entryListPaginationSettings from local storage
								localStorage.removeItem(entryListPaginationSettingsKey);

								// Reset the entryListPaginationSettings to the default state
								entryListPaginationSettings = {
									collectionName: $collection.name,
									density: 'normal',
									sorting: { sortedBy: '', isSorted: 0 },
									currentPage: 1,
									rowsPerPage: 10,
									filters: {},
									displayTableHeaders: []
								};

								// Reset displayTableHeaders to an empty array
								displayTableHeaders = [];

								// Reset selectAllColumns to true
								selectAllColumns = true;

								// Refresh the table data
								refreshTableData();
							}}
						>
							<iconify-icon icon="material-symbols-light:device-reset" width="30" class="text-tertiary-500" />
							Reset
						</button>
					</div>

					<section
						use:dndzone={{
							items: displayTableHeaders,
							flipDurationMs
						}}
						on:consider={handleDndConsider}
						on:finalize={handleDndFinalize}
						class="flex flex-wrap justify-center gap-1 rounded-md p-2"
					>
						{#each displayTableHeaders as header (header.id)}
							<button
								class="chip {header.visible ? 'variant-filled-secondary' : 'variant-ghost-secondary'} w-100 mr-2 flex items-center justify-center"
								animate:flip={{ duration: flipDurationMs }}
								on:click={() => {
									// Toggle the visibility of the header
									header.visible = !header.visible;

									// Check if all columns are currently visible
									const allColumnsVisible = displayTableHeaders.every((header) => header.visible);

									// Update selectAllColumns based on the visibility of all columns
									selectAllColumns = allColumnsVisible;
								}}
							>
								{#if header.visible}
									<span><iconify-icon icon="fa:check" /></span>
								{/if}
								<span class="ml-2 capitalize">{header.name}</span>
							</button>
						{/each}
					</section>
				</div>
			</div>
		{/if}

		<div class="table-container max-h-[calc(100dvh-120px)] overflow-auto">
			<table class="table table-interactive table-hover {density === 'compact' ? 'table-compact' : density === 'normal' ? '' : 'table-comfortable'}">
				<!-- Table Header -->
				<thead class="text-tertiary-500 dark:text-primary-500">
					{#if filterShow}
						<tr class="divide-x divide-surface-400">
							<th>
								<!-- Clear All Filters Button -->
								{#if Object.keys(filters).length > 0}
									<button
										class="variant-outline btn-icon"
										on:click={() => {
											// Clear all filters
											filters = {};
										}}
									>
										<iconify-icon icon="material-symbols:close" width="24" />
									</button>
								{/if}
							</th>

							<!-- Filter -->
							{#each tableHeaders as header}
								<th>
									<div class="flex items-center justify-between">
										<FloatingInput
											type="text"
											icon="material-symbols:search-rounded"
											label={m.entrylist_filter()}
											name={header.name}
											on:input={(e) => {
												const value = asAny(e.target).value;
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
						<TableIcons bind:checked={SelectAll} iconStatus="all" />

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
								<div class="relative flex items-center justify-center text-center">
									<!-- TODO: fix if content is translated -->
									{#if data?.entryList[0]?.translated}
										<iconify-icon icon="bi:translate" width="14" class="absolute right-0 top-0 text-sm text-white" />
										{header.label}
									{:else}
										{header.label}
									{/if}

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
						<tr class="divide-x divide-surface-400">
							<TableIcons iconStatus={data?.entryList[index]?.status} bind:checked={selectedMap[index]} />

							{#each tableHeaders as header}
								<td
									on:click={() => {
										entryData.set(data?.entryList[index]);
										// console.log(data);
										mode.set('edit');
										handleSidebarToggle();
									}}
									class="text-center font-bold"
								>
									{#if header.name === 'status'}
										<!-- Use the Status component to display the Status -->
										<Status value={row[header.name]} />
									{:else}
										{@html row[header.name]}
									{/if}
								</td>
							{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>

		<!-- Pagination not updating -->
		<!-- <div class="sticky bottom-0 left-0 right-0 mt-2 flex flex-col items-center justify-center px-2 md:flex-row md:justify-between md:p-4">
			<TablePagination {currentPage} {pagesCount} {rowsPerPage} {rowsPerPageOptions} {refreshTableData} />
		</div> -->

		<!-- Pagination   working -->
		<div class="sticky bottom-0 left-0 right-0 mt-2 flex flex-col items-center justify-center px-2 md:flex-row md:justify-between md:p-4">
			<!-- <TablePagination {currentPage} {pagesCount} {rowsPerPage} {refreshTableData} /> -->

			<div class="mb-1 text-xs md:mb-0 md:text-sm">
				<span>{m.entrylist_page()}</span> <span class="text-tertiary-500 dark:text-primary-500">{currentPage}</span>
				<span>{m.entrylist_of()}</span> <span class="text-tertiary-500 dark:text-primary-500">{data?.pagesCount || 0}</span>
			</div>

			<!-- Pagination controls -->
			<div class="variant-outline btn-group">
				<!-- First page -->
				<button
					type="button"
					class="btn"
					disabled={isFirstPage}
					aria-label="Go to first page"
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
					disabled={isFirstPage}
					aria-label="Go to Previous page"
					on:click={() => {
						currentPage = Math.max(1, currentPage - 1);
						refreshTableData();
					}}
				>
					<iconify-icon icon="material-symbols:chevron-left" width="24" class:disabled={currentPage === 1} />
				</button>

				<!-- Rows per page select dropdown -->
				{#if rowsPerPage !== undefined}
					<select
						value={rowsPerPage}
						on:change={rowsPerPageHandler}
						class="mt-0.5 bg-transparent text-center text-tertiary-500 dark:text-primary-500"
					>
						{#each rowsPerPageOptions as pageSize}
							<option class="bg-surface-500 text-white" value={pageSize}> {pageSize} {m.entrylist_rows()} </option>
						{/each}
					</select>
				{/if}

				<!-- Next page -->
				<button
					type="button"
					class="btn"
					disabled={isLastPage}
					aria-label="Go to Next page"
					on:click={() => {
						currentPage = Math.min(currentPage + 1, data?.pagesCount || 0);
						refreshTableData();
					}}
				>
					<iconify-icon icon="material-symbols:chevron-right" width="24" class:active={currentPage === data?.pagesCount} />
				</button>

				<!-- Last page -->
				<button
					type="button"
					class="btn"
					disabled={isLastPage}
					aria-label="Go to Last page"
					on:click={() => {
						currentPage = data?.pagesCount || 0;
						refreshTableData();
					}}
				>
					<iconify-icon icon="material-symbols:last-page" width="24" class:disabled={currentPage === data?.pagesCount} />
				</button>
			</div>
		</div>
	{:else}
		<!-- Display a message when no data is yet available -->
		<div class="text-center text-tertiary-500 dark:text-primary-500">
			<iconify-icon icon="bi:exclamation-circle-fill" height="44" class="mb-2" />
			<p class="text-lg">
				No {$collection.name} Data
			</p>
		</div>
	{/if}
{/if}

<style lang="postcss">
	.up {
		transform: rotate(-180deg);
	}
	div::-webkit-scrollbar-thumb {
		border-radius: 50px;
		background-color: #0ec423;
	}
	div::-webkit-scrollbar {
		width: 10px;
	}
</style>
