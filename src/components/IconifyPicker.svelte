<script lang="ts">
	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	// Import loadIcons function from Iconify Svelte library
	import { loadIcons } from '@iconify/svelte';

	let icons = []; // array of icon names
	let loading = false; // loading state
	let start = 0; // Declare a variable for the start index and initialize it to 0
	let total = 0; // variable to store the total number of results
	let selectedLibrary = 'ic'; // Default library is 'ic - Google Material Icons'
	let iconLibraries = {};
	// let librariesData = {}; // Declare a variable to store the fetched data
	let showDropdown = false;

	export const icon = '';
	export let iconselected = '';
	export let searchQuery = '';

	// function to fetch icons from Iconify API
	async function searchIcons(query: string, liabraryCategory: string, event?: FocusEvent) {
		loading = true;
		// Only show the dropdown if the search query is not empty
		showDropdown = true;
		try {
			// TODO: Allow Libray filtering `https://api.iconify.design/search?query=${encodeURIComponent(searchQuery)}&prefix=${selectedLibrary}&limit=50&start=${start}`
			// Use search API query with prefix and limit parameters
			const response = await fetch(
				`https://api.iconify.design/search?query=${encodeURIComponent(searchQuery)}&prefix=${liabraryCategory ? liabraryCategory : 'ic'}`
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

	// function to select an icon
	function selectIcon(icon: string) {
		iconselected = icon; // update selected icon name
		showDropdown = false; // close the dropdown after selection
	}

	// Function to go to the next page of results by increasing the start index by 50
	function nextPage() {
		start += 50;
		searchIcons(searchQuery, selectedLibrary);
	}
	// Function to go to the previous page of results by decreasing the start index by 50
	function prevPage() {
		start -= 50;
		searchIcons(searchQuery, selectedLibrary);
	}

	const removeIcon = () => {
		iconselected = '';
	};

	// Function to fetch available icon libraries
	async function getIconLiabraries() {
		try {
			const response = await fetch('https://api.iconify.design/collections');
			const data = await response.json();
			iconLibraries = data;
		} catch (error) {
			console.log(error);
		}
	}
</script>

<!-- Display selected icon -->
{#if iconselected}
	<div class="-mt-3 mb-1 flex items-center justify-around gap-2">
		<div class="flex items-center gap-2 p-2">
			<iconify-icon icon={iconselected} width="30" class="variant-ghost-primary btn-icon p-2" />
			<p>
				{$LL.MODAL_IconPicker_Name()}
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
	bind:value={searchQuery}
	placeholder={$LL.MODAL_IconPicker_Placeholder()}
	class="variant-filled-surface w-full"
	on:input={() => searchIcons(searchQuery, selectedLibrary)}
/>

<!-- dropdown section -->
{#if showDropdown}
	<div class="dropdown">
		<!-- Library filter dropdown -->
		<div class="mb-4 w-full">
			<select
				bind:value={selectedLibrary}
				on:click={getIconLiabraries}
				on:change={() => {
					start = 0;
					searchIcons(searchQuery, selectedLibrary);
				}}
				class="variant-filled-surface mt-2 w-full"
			>
				{#if getIconLiabraries()}
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
		<div class="mt-2 flex justify-between">
			<button disabled={start === 0} on:keydown on:click={prevPage} class="variant-filled-primary btn btn-sm"
				>{$LL.MODAL_IconPicker_Previous()}</button
			>
			<div class="text-white">Number of Icons: <span class="text-primary-500">{total}</span></div>
			<button disabled={icons.length < 50} on:keydown on:click={nextPage} class="variant-filled-primary btn btn-sm"
				>{$LL.MODAL_IconPicker_Next()}</button
			>
		</div>
	</div>
{/if}
