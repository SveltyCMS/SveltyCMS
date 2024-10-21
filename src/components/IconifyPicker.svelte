<!-- 
@file src/components/IconifyPicker.svelte
@description IconifyPicker component for selecting icons from Iconify libraries
@features Search icons, pagination, library selection, icon preview
@dependencies @iconify/svelte, ParaglideJS
@usage <IconifyPicker bind:iconselected />
-->

<script lang="ts">
	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Import loadIcons function from Iconify Svelte library
	import { loadIcons } from '@iconify/svelte';

	let icons = []; // Array of icon names
	let start = 0; // Start index for pagination
	let selectedLibrary = 'ic'; // Default library is 'ic - Google Material Icons'
	let librariesLoaded = false;
	let iconLibraries = {};
	let page = 0; // Page counter for pagination
	let showDropdown = false;

	export const icon: string = '';
	export let iconselected: string;
	export let searchQuery: string = '';

	// Fetch icons from Iconify API
	async function searchIcons(query: string, libraryCategory: string) {
		// Calculate start index based on current page number
		start = page * 50; // Use page variable instead of start variable
		showDropdown = true;
		try {
			const response = await fetch(
				`https://api.iconify.design/search?query=${encodeURIComponent(searchQuery)}&prefix=${libraryCategory ? libraryCategory : 'ic'}&start=${start}`
			);
			const data = await response.json();

			if (data && data.icons) {
				icons = data.icons; // update icons array
				// Use loadIcons function to preload icons from API
				loadIcons(icons.map((icon) => `${data.prefix}:${icon}`));
			}
		} catch (error) {
			console.error('An error occurred while fetching icons:', error);
		}
	}

	// Go to the next page of results
	function nextPage() {
		page += 1;
		searchIcons(searchQuery, selectedLibrary);
	}

	// Go to the previous page of results
	function prevPage() {
		page -= 1;
		if (page < 0) page = 0;
		searchIcons(searchQuery, selectedLibrary);
	}

	// Select an icon and close the dropdown
	function selectIcon(icon: string) {
		iconselected = icon; // update selected icon name
		showDropdown = false; // close the dropdown after selection
	}

	// Remove the selected icon
	const removeIcon = () => {
		iconselected = '';
	};

	// Fetch available icon libraries
	async function getIconLibraries() {
		try {
			const response = await fetch('https://api.iconify.design/collections');
			if (!response.ok) {
				console.error(`Failed to fetch icon libraries: ${response.status}`);
				return;
			}
			const data = await response.json();
			iconLibraries = data;
			librariesLoaded = true;
			console.log('Successfully fetched icon libraries'); // Optional success message
		} catch (error) {
			console.error('Error fetching icon libraries:', error);
		}
	}

	// Show dropdown and fetch libraries
	function showLibrariesAndDropdown() {
		getIconLibraries();
		showDropdown = true;
	}
</script>

<div class="flex w-full flex-col">
	<!-- Display selected icon -->
	{#if iconselected}
		<div class="-mt-3 mb-1 flex items-center justify-start gap-2">
			<div class="flex items-center gap-3 p-2">
				<iconify-icon icon={iconselected} width="30" class="py-2 text-tertiary-500" />
				<p>
					{m.iconpicker_name()}
					<span class="text-tertiary-500 dark:text-primary-500">{iconselected}</span>
				</p>
			</div>
			<button class="variant-ghost btn-icon" type="button" on:mouseup={removeIcon}>
				<iconify-icon icon="icomoon-free:bin" width="22" />
			</button>
		</div>
	{/if}

	<!-- Icon input with dropdown and pagination -->
	<input
		type="text"
		id="icon"
		bind:value={searchQuery}
		placeholder={iconselected ? `Replace Icon:    ${iconselected}` : m.iconpicker_placeholder()}
		class="input w-full text-black dark:text-primary-500"
		on:input={() => searchIcons(searchQuery, selectedLibrary)}
		on:focus={showLibrariesAndDropdown}
	/>

	<!-- Dropdown section -->
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

			<!-- Icon selection buttons -->
			{#each icons as icon}
				<button on:click={() => selectIcon(icon)}>
					<iconify-icon {icon} width="24" class="hover:rounded hover:bg-primary-500" />
				</button>
			{/each}

			<!-- Pagination buttons -->
			{#if icons.length > 0}
				<div class="mt-2 flex justify-between">
					<button disabled={start === 0} on:click={prevPage} class={`${page === 0 ? 'hidden' : 'block'} variant-filled-primary btn-sm rounded`}
						>{m.button_previous()}
					</button>

					<div class="dark:text-white">
						Showing Icons: <span class="text-primary-500">{icons.length}</span>
					</div>
					<button
						disabled={icons.length < 50}
						on:click={nextPage}
						class={`${icons.length < 50 ? 'hidden' : 'block'} variant-filled-primary btn-sm rounded`}>{m.button_next()}</button
					>
				</div>
			{/if}
		</div>
	{/if}
</div>
