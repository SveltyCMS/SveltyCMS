<script lang="ts">
	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Import loadIcons function from Iconify Svelte library
	import { loadIcons } from '@iconify/svelte';

	let icons = []; // array of icon names
	let loading = false; // loading state
	let start = 0; // Declare a variable for the start index and initialize it to 0
	let total = 0; // variable to store the total number of results
	let selectedLibrary = 'ic'; // Default library is 'ic - Google Material Icons'
	let librariesLoaded = false;
	let iconLibraries = {};
	let page = 0; // Initialize page counter
	let showDropdown = false;

	export let icon: string;
	export let iconselected: string;
	export let searchQuery: string;

	// function to fetch icons from Iconify API
	async function searchIcons(query: string, libraryCategory: string, event?: FocusEvent) {
		// Calculate start index based on current page number
		start = page * 50; // Use page variable instead of start variable

		loading = true;
		showDropdown = true;
		try {
			// Use search API query with prefix and limit parameters
			const response = await fetch(
				`https://api.iconify.design/search?query=${encodeURIComponent(searchQuery)}&prefix=${libraryCategory ? libraryCategory : 'ic'}&start=${start}`
			);
			const data = await response.json();

			if (data && data.icons) {
				total = data.total; // update total variable
				icons = data.icons; // update icons array
				// Use loadIcons function to preload icons from API
				loadIcons(icons.map((icon) => `${data.prefix}:${icon}`));
			}
		} catch (error) {
			// Display error message
			console.error('An error occurred while fetching icons:', error);
		}
		loading = false;
	}

	// Function to go to the next page of results
	function nextPage() {
		page += 1;
		searchIcons(searchQuery, selectedLibrary);
	}

	// Function to go to the previous page of results
	function prevPage() {
		page -= 1;
		if (page < 0) page = 0;
		searchIcons(searchQuery, selectedLibrary);
	}

	// function to select an icon
	function selectIcon(icon: string) {
		iconselected = icon; // update selected icon name
		showDropdown = false; // close the dropdown after selection
	}

	const removeIcon = () => {
		iconselected = '';
	};

	// Function to fetch available icon libraries
	async function getIconLibraries() {
		try {
			const response = await fetch('https://api.iconify.design/collections');
			const data = await response.json();
			iconLibraries = data;
			// Add 'All' option to iconLibraries
			iconLibraries['all'] = { name: 'All Icon Libraries', total: 'all' };

			// Move the 'All' option to the beginning
			let tempLibraries = { all: iconLibraries['all'], ...iconLibraries };
			iconLibraries = tempLibraries;

			librariesLoaded = true;
		} catch (error) {
			console.log(error);
		}
	}

	// Function to show dropdown and fetch libraries
	function showLibrariesAndDropdown() {
		getIconLibraries();
		showDropdown = true;
	}
</script>

<div class="flex w-full flex-col">
	<!-- Display selected icon -->
	{#if iconselected}
		<div class="-mt-3 mb-1 flex items-center justify-around gap-2">
			<div class="flex items-center gap-2 p-2">
				<iconify-icon icon={iconselected} width="30" class="variant-ghost-primary btn-icon mt-1 py-2" />
				<p>
					{m.iconpicker_name()}
					<span class="text-primary-500">{iconselected}</span>
				</p>
			</div>
			<button class="variant-ghost btn-icon" type="button" on:mouseup={removeIcon}>
				<iconify-icon icon="icomoon-free:bin" width="24" class="" />
			</button>
		</div>
	{/if}

	<!-- Icon input with dropdown and pagination -->
	<input
		type="text"
		id="icon"
		bind:value={icon}
		placeholder={m.iconpicker_placeholder()}
		class="input w-full"
		on:input={() => searchIcons(searchQuery, selectedLibrary)}
		on:focus={showLibrariesAndDropdown}
	/>

	<!-- dropdown section -->
	{#if showDropdown}
		<div class="dropdown">
			<!-- Library filter dropdown -->
			<div class="mb-2">
				<select
					bind:value={selectedLibrary}
					on:click={getIconLibraries}
					on:change={() => {
						start = 0;
						searchIcons(searchQuery, selectedLibrary);
					}}
					class="input mt-2 w-full"
				>
					{#if librariesLoaded}
						{#each Object.keys(iconLibraries) as library}
							<option value={library}>
								{iconLibraries[library].name}: {library}/{iconLibraries[library].total}
							</option>
						{/each}
					{/if}
				</select>
			</div>

			<!-- Render your dropdown content here -->
			{#each icons as icon}
				<button on:click={() => selectIcon(icon)}>
					<iconify-icon {icon} width="24" class="hover:rounded hover:bg-primary-500" />
				</button>
			{/each}

			<!-- Pagination buttons -->
			{#if icons.length > 0}
				<div class="mt-2 flex justify-between">
					<button
						disabled={start === 0}
						on:keydown
						on:click={prevPage}
						class={`${page === 0 ? 'hidden' : 'block'} variant-filled-primary btn-sm rounded`}
						>{m.iconpicker_previous()}
					</button>

					<div class="dark:text-white">
						Showing Icons: <span class="text-primary-500">{icons.length}</span>
					</div>
					<button
						disabled={icons.length < 50}
						on:keydown
						on:click={nextPage}
						class={`${icons.length < 50 ? 'hidden' : 'block'} variant-filled-primary btn-sm rounded`}>{m.iconpicker_next()}</button
					>
				</div>
			{/if}
		</div>
	{/if}
</div>
