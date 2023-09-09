<script lang="ts">
	// Skeleton
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { popup } from '@skeletonlabs/skeleton';

	// icon popup
	const popupIcon: PopupSettings = {
		event: 'focus-click',
		target: 'popupIcon',
		placement: 'bottom',
		closeQuery: '' // prevent any element inside the popup from closing it
	};

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
			// Use search API query with prefix and limit parameters
			// Use prefix=ic to filter by Google Material icon set
			// Use start variable to specify the start index of the result
			const response = await fetch(
				`https://api.iconify.design/search?query=${encodeURIComponent(
					searchQuery
				)}&prefix=ic&limit=50&start=${start}`
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
		// TODO : close the skeleton popup when the icon was selects
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
</script>

<!-- iconify icon -->
<div class="mb-4 flex items-center gap-4">
	<label for="icon" class="relative">
		Icon: <iconify-icon
			icon="material-symbols:info"
			width="18"
			class="absolute -top-3 right-1"
		/></label
	>
	<input
		type="text"
		id="icon"
		bind:value={searchQuery}
		placeholder="Search for an icon..."
		class="variant-filled-surface {iconselected ? 'sm:w-1/2' : 'w-full'}"
		use:popup={popupIcon}
	/>
	<!-- Display selected icon -->
	{#if iconselected}
		<div class="hidden items-center justify-center gap-2 sm:flex">
			<!-- todo: display icon.name -->
			<iconify-icon icon={iconselected} width="30" class="text-primary-500" />
			<p>Name: <span class=" text-primary-500">{iconselected}</span></p>
		</div>
	{/if}
</div>
<!-- Display selected icon -->
{#if iconselected}
	<div class="-mt-3 mb-1 flex items-center justify-center gap-2 sm:hidden">
		<!-- todo: display icon.name -->
		<iconify-icon icon={iconselected} width="30" class="text-primary-500" />
		<p>Name: <span class=" text-primary-500">{iconselected}</span></p>
	</div>
{/if}

<!-- icon popup -->
<div class="card z-10 w-96 p-4 shadow-xl" data-popup="popupIcon">
	<div>
		<div class=" mb-2 border-b text-center">
			<p class="text-primary-500">Select from Google Material Icons</p>

			<iconify-icon {icon} width="30" class="" />
		</div>
		<div class="grid grid-cols-5 gap-2">
			{#each icons as icon}
				<button class="relative flex flex-col items-center" on:click={() => selectIcon(icon)}>
					<span class="iconify" data-icon={icon} data-inline="false" />
					<iconify-icon {icon} width="24" class="hover:text-primary-500" />
				</button>
			{/each}
		</div>

		<!-- Add buttons for pagination -->
		<!-- TODO Button Click will close popup -->
		<div class="mt-6 flex justify-between">
			<!-- Disable the previous button if the start index is zero -->
			<button
				disabled={start === 0}
				on:keydown
				on:click={prevPage}
				class="variant-filled-primary btn btn-sm">Previous</button
			>
			<!-- Disable the next button if there are less than 50 icons in the current page -->
			<button
				disabled={icons.length < 50}
				on:keydown
				on:click={nextPage}
				class="variant-filled-primary btn btn-sm">Next</button
			>
		</div>
	</div>
	<div class="bg-surface-100-800-token arrow" />
</div>

<style lang="postcss">
	label {
		min-width: 100px;
	}
</style>
