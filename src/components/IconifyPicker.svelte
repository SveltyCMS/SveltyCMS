<script lang="ts">
	// Skeleton
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem, popup } from '@skeletonlabs/skeleton';

	// icon popup
	const popupIcon: PopupSettings = {
		event: 'focus-click',
		target: 'popupIcon',
		placement: 'bottom',
		closeQuery: '' // prevent any element inside the popup from closing it
	};

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	// Import loadIcons function from Iconify Svelte library
	import { loadIcons } from '@iconify/svelte';

	export let icon = '';
	let icons = []; // array of icon names
	export let iconselected = '';
	let loading = false; // loading state
	export let searchQuery = '';

	//TODO: Update Search on Next/Previous event
	let total = 0; // variable to store the total number of results

	// function to fetch icons from Iconify API
	async function searchIcons(query: string, event?: FocusEvent) {
		loading = true;
		try {
			// TODO: Allow Libray filtering `https://api.iconify.design/search?query=${encodeURIComponent(searchQuery)}&prefix=${selectedLibrary}&limit=50&start=${start}`
			// Use search API query with prefix and limit parameters
			const response = await fetch(`https://api.iconify.design/search?query=${encodeURIComponent(searchQuery)}&limit=50&start=${start}`);
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

		// TODO: fix close on select
		//popupStore.close(); // close the popup
	}

	// reactive statement to update selected icon name on click
	$: if (iconselected) {
		//console.log(`Selected icon: ${iconselected}`);
	}

	// Declare a variable for the start index and initialize it to 0
	let start = 0;

	// Reactive statement to fetch icons whenever the start index changes
	$: if (start >= 0) {
		//console.log(`start: ${start}`);
		searchIcons(searchQuery);
	}

	// Function to go to the next page of results by increasing the start index by 50
	function nextPage() {
		start += 50;
		//console.log('startnextPage:', start);
		searchIcons(searchQuery);
	}
	// Function to go to the previous page of results by decreasing the start index by 50
	function prevPage() {
		start -= 50;
		//console.log('startprevPage:', start);
		searchIcons(searchQuery);
	}

	function removeIcon() {
		iconselected = '';
	}

	let comboboxValue: string;
	let selectedLibrary: string;

	const popupCombobox: PopupSettings = {
		event: 'focus-click',
		target: 'popupCombobox',
		placement: 'bottom',
		closeQuery: '.listbox-item'
	};

	// Add an array to store the available Iconify libraries
	let iconLibraries = ['ic']; // Default library is 'ic'

	// Function to fetch available icon libraries
	export async function load({ fetch }) {
		try {
			const response = await fetch('https://api.iconify.design/@iconify/json/search.json');
			const data = await response.json();
			const iconLibraries = Object.keys(data.prefixes);
			return { props: { iconLibraries } };
		} catch (error) {
			console.error('An error occurred while fetching icon libraries:', error);
		}
	}
	let showDropdown = false;
</script>

<!-- Display selected icon -->
{#if iconselected}
	<div class="-mt-3 mb-1 flex items-center justify-around gap-2">
		<div class="p-2 flex items-center gap-2">
			<iconify-icon icon={iconselected} width="30" class="btn-icon p-2 variant-ghost-primary" />
			<p>{$LL.MODAL_IconPicker_Name()} 
				<span class="text-primary-500">{iconselected}</span>
			</p>
		</div>
		<button class="btn-icon variant-ghost" type="button" on:click={removeIcon}>
			<iconify-icon icon="icomoon-free:bin" width="24" class=""  />
		</button>
	</div>
{/if}

<!-- iconify input -->
<div class="mb-4 w-full flex-col items-center gap-4">
	<input
		type="text"
		id="icon"
		bind:value={searchQuery}
		placeholder={$LL.MODAL_IconPicker_Placeholder()}
		class="variant-filled-surface w-full"
		use:popup={popupIcon}
		on:input={() => searchIcons(searchQuery)}
	/>

	<!-- Add this dropdown section -->
	{#if showDropdown}
		<div class="dropdown">
			<!-- Render your dropdown content here -->
			<!-- For example, you can use a list of suggestions -->
			{#each icons as icon}
				<button on:click={() => selectIcon(icon)}>{icon}</button>
			{/each}
		</div>
	{/if}
</div>

<!-- icon popup -->
<div class="card z-10 p-4 shadow-xl" data-popup="popupIcon">
	<div>
		<div class=" mb-2 border-b text-center">
			<p class="text-primary-500">{$LL.MODAL_IconPicker_Select()}</p>

			<iconify-icon {icon} width="30" class="" />

			<p class="text-primary-500">Icon Filter</p>

			<button class="variant-filled-surface btn-sm w-full justify-between" use:popup={popupCombobox}>
				<span class="capitalize">{selectedLibrary ?? 'Select Library'}</span>
				<span>↓</span>
			</button>

			<div class="w-50 card input z-10 py-2 shadow-xl" data-popup="popupCombobox">
				<ListBox rounded="rounded-none">
					{#each iconLibraries as library (library)}
						<ListBoxItem bind:group={selectedLibrary} name="medium" value={library}>{library}</ListBoxItem>
					{/each}
				</ListBox>
				<div class="bg-surface-100-800-token arrow" />
			</div>

			<div class="flex max-w-lg flex-wrap gap-2">
				{#each icons as icon}
					<button class="relative flex flex-col items-center" on:click={() => selectIcon(icon)}>
						<span class="iconify" data-icon={icon} data-inline="false" />
						<iconify-icon {icon} width="24" class="hover:text-primary-500" />
					</button>
				{/each}
			</div>
		</div>
		<!-- Add buttons for pagination -->
		<!-- TODO Button Click will close popup -->
		<div class="mt-6 flex justify-between">
			<!-- Disable the previous button if the start index is zero -->
			<button disabled={start === 0} on:keydown on:click={prevPage} class="variant-filled-primary btn btn-sm"
				>{$LL.MODAL_IconPicker_Previous()}</button
			>
			<!-- Disable the next button if there are less than 50 icons in the current page -->
			<button disabled={icons.length < 50} on:keydown on:click={nextPage} class="variant-filled-primary btn btn-sm"
				>{$LL.MODAL_IconPicker_Next()}</button
			>
		</div>
	</div>
	<div class="bg-surface-100-800-token arrow" />
</div>
