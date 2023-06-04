<script lang="ts">
	import { goto } from '$app/navigation';

	// show/hide Left Sidebar
	import AnimatedHamburger from '$src/components/AnimatedHamburger.svelte';
	import { toggleLeftSidebar } from '$src/stores/store';
	//export let open = false;
	export let switchSideBar = false;

	// Collection Creation
	import { TabGroup, Tab, Autocomplete, popup, Modal, modalStore } from '@skeletonlabs/skeleton';
	import type {
		AutocompleteOption,
		PopupSettings,
		ModalSettings,
		ModalComponent
	} from '@skeletonlabs/skeleton';

	import axios from 'axios';

	let name = '';
	let DBName = '';
	let description = '';
	let icon: any = '';
	let status = 'unpublished';

	// TODO: Show icon and Text color
	const statuses: AutocompleteOption[] = [
		{ label: 'published', value: 'published', color: 'blue', icon: 'bi:hand-thumbs-up-fill' },
		{ label: 'unpublished', value: 'unpublished', color: 'red', icon: 'bi:pause-circle' },
		{ label: 'draft', value: 'draft', color: 'green', icon: 'bi:pencil-square' },
		{ label: 'schedule', value: 'schedule', color: 'purple', icon: 'bi:clock' },
		{ label: 'cloned', value: 'cloned', color: 'orange', icon: 'bi:clipboard-data-fill' }
	];

	let slug = '';
	let autoUpdateSlug = true;

	$: {
		// Update DBName  lowercase and replace Spaces
		DBName = name.toLowerCase().replace(/ /g, '_');

		// Automatically update slug when name changes
		if (autoUpdateSlug) {
			slug = name.toLowerCase().replace(/\s+/g, '_');
		}
	}

	// Stop automatically updating slug when user manually edits it
	function onSlugInput() {
		autoUpdateSlug = false;
	}

	let lockedName: boolean = true;
	let lockedWidget: boolean = true;

	function checkInputName() {
		if (name) {
			lockedName = false;
		} else {
			lockedName = true;
		}
	}

	// reactive statement to update selected lockedName on click
	$: {
		lockedName = !name;
	}
	function checkInputWidget() {
		if (!lockedName) {
			lockedWidget = false;
		} else {
			lockedWidget = true;
			lockedName = false;
		}
	}

	// -------------tooltips----------------
	const TooltipName: PopupSettings = {
		event: 'click',
		target: 'TooltipName',
		placement: 'left'
	};

	const TooltipDescription: PopupSettings = {
		event: 'click',
		target: 'TooltipDescription',
		placement: 'left'
	};

	const TooltipIcon: PopupSettings = {
		event: 'click',
		target: 'TooltipIcon',
		placement: 'left'
	};

	const TooltipStatus: PopupSettings = {
		event: 'click',
		target: 'TooltipStatus',
		placement: 'left'
	};

	const TooltipSlug: PopupSettings = {
		event: 'click',
		target: 'TooltipSlug',
		placement: 'left'
	};

	// -------------iconfy icons list----------------
	// Import loadIcons function from Iconify Svelte library
	import { loadIcons } from '@iconify/svelte';

	let icons: any[] = []; // array of icon names
	let iconselected: any = '';
	let loading = false; // loading state
	let searchQuery = '';

	// icon popup
	const popupIcon: PopupSettings = {
		event: 'click',
		target: 'popupIcon',
		placement: 'bottom',
		closeQuery: '' // prevent any element inside the popup from closing it
	};

	// function to select an icon
	function selectIcon(icon: string) {
		iconselected = icon; // update selected icon name
		// close(popupIcon); // close the popup
	}

	// function to fetch icons from Iconify API
	async function searchIcons(query: string) {
		loading = true;
		try {
			// Use search API query with prefix and limit parameters
			// Use prefix=ic to filter by Google Material icon set
			// Use start variable to specify the start index of the result
			const response = await axios.get(
				`https://api.iconify.design/search?query=${encodeURIComponent(
					searchQuery
				)}&prefix=ic&limit=50&start=${start}`
			);
			console.log('response', response);
			if (response.data && response.data.icons) {
				icons = response.data.icons; // update icons array
				//console.log('icons', icons);

				// Use loadIcons function to preload icons from API
				loadIcons(icons.map((icon) => `${response.data.prefix}:${icon}`));
			}
		} catch (error) {
			// Display error message
			console.error('An error occurred while fetching icons:', error);
		}
		loading = false;
	}

	// reactive statement to update selected icon name on click
	$: if (iconselected) {
		//console.log(`Selected icon: ${iconselected}`);
	}

	// Declare a variable for the start index and initialize it to 0
	let start = 0;

	// Reactive statement to fetch icons whenever the start index changes
	$: if (start >= 0) {
		searchIcons(searchQuery);
	}

	// Function to go to the next page of results by increasing the start index by 50
	function nextPage() {
		start += 50;
	}

	// Function to go to the previous page of results by decreasing the start index by 50
	function prevPage() {
		start -= 50;
	}

	// ------------widget builder ---------------
	let WidgetSelected = false;

	let selectedWidget = '';
	let selectedWidgets = [{ widget: null, options: {}, input: '' }];
	let selectedWidgetoptions = {};

	// create an array to store the input values for each widget

	// Autocomplete Input Widget select
	let inputPopupWidgets = [''];
	let popupSettings: PopupSettings = {
		event: 'focus-click',
		closeQuery: '',
		target: 'popupAutocomplete',
		placement: 'bottom'
	};

	// create a function to add a widget and push a new input value to the array
	function onAddWidgetClick() {
		// modalStore.trigger(modal);
		selectedWidgets = [...selectedWidgets, { widget: null, options: {}, input: '' }];
		inputPopupWidgets.push('');
	}

	// create a function to handle the selection of a widget and update the input value in the array
	function onPopupWidgetSelect(event: CustomEvent<AutocompleteOption>, index: number) {
		// check if inputPopupWidgets is an empty string and use an empty array as the default value
		inputPopupWidgets = inputPopupWidgets || [];
		inputPopupWidgets[index] = event.detail.label;
		const widgetName = event.detail.value;
		selectedWidgets[index].widget = widgetName;
		selectedWidgets[index].input = '';
		// use widgetName as the index type
		selectedWidgetoptions[widgetName[index]] = {};
	}

	//  Confirm Modal
	const modal: ModalSettings = {
		type: 'confirm',
		// Data
		title: 'Please Confirm',
		body: 'Are you sure you wish to proceed?',
		// TRUE if confirm pressed, FALSE if cancel pressed
		response: (r: boolean) => console.log('response:', r)
	};

	function WidgetOptions() {
		WidgetSelected = true;
	}

	function back() {
		lockedWidget = true;
	}

	// -------------Save Collection to Database----------------
	async function createCollection() {
		const response = await fetch(window.location.href, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				name,
				DBName,
				description,
				icon,
				status,
				slug
			})
		});

		if (response.ok) {
			// navigate back to the collection overview page
			goto('/builder');
		} else {
			// handle error
			console.error('An error occurred while creating the collection');
		}
	}

	function cancel() {
		// reset the form or navigate to a different page
		goto('/builder');
	}
</script>

<div class="flex mr-1 align-centre mb-2">
	{#if !switchSideBar && $toggleLeftSidebar}
		<AnimatedHamburger />
	{/if}

	<h1 class={!$toggleLeftSidebar ? 'ml-2' : ''}>Create a New Collection</h1>
</div>

<p class="mt-4 mb-6">This builder will guide you to create a new Content Collection</p>

<form class="space-y-4 dark:text-black" on:submit|preventDefault={createCollection}>
	<!-- Collection Name -->
	<div class="mb-4 ml-1.5 flex items-center gap-4">
		<label class="relative dark:text-white"
			>Name: <span class="text-error-500">*</span>
			<iconify-icon
				icon="material-symbols:info"
				width="18"
				class="absolute -top-3 right-2"
				use:popup={TooltipName}
				on:input={checkInputName}
			/>
		</label>

		<!-- tooltip -->
		<div class="card p-4 variant-filled-secondary" data-popup="TooltipName">
			<p>Enter the name how your Collection will be called</p>
			<div class="arrow variant-filled-secondary" />
		</div>

		<div class="flex flex-col justify-center pr-2 w-full">
			<input
				type="text"
				required
				id="name"
				bind:value={name}
				placeholder="Collection Unique Name"
				class="ml-1 input dark:text-white"
			/>

			<div class="ml-2 dark:text-white">
				Created Database Name: <span class="font-bold text-primary-500">{DBName}</span>
			</div>
		</div>
	</div>

	<!-- Define Collection  -->
	{#if lockedWidget}
		<div class="border border-primary-500 rounded-md p-2">
			<p class="mb-2 font-bold dark:text-white">Optional values:</p>

			<!-- Collection Description -->
			<div class="mb-4 flex items-center gap-4">
				<label class="relative dark:text-white">
					Description:
					<iconify-icon
						icon="material-symbols:info"
						width="18"
						use:popup={TooltipDescription}
						class="absolute -top-3 right-1"
					/>
				</label>

				<textarea
					id="description"
					rows="2"
					cols="50"
					bind:value={description}
					placeholder="Describe your Collection"
					class="input dark:text-white"
				/>
			</div>

			<!-- tooltip -->
			<div class="card p-4 variant-filled-secondary" data-popup="TooltipDescription">
				<p>Enter a Short Descrition what your Collection is used for.</p>
				<div class="arrow variant-filled-secondary" />
			</div>

			<!-- iconify icon -->
			<div class="mb-4 flex items-center gap-4">
				<label class="relative dark:text-white">
					Icon:
					<iconify-icon
						icon="material-symbols:info"
						width="18"
						use:popup={TooltipIcon}
						class="absolute -top-3 right-1"
					/>
				</label>

				<!-- tooltip -->
				<div class="card p-4 variant-filled-secondary" data-popup="TooltipIcon">
					<p>Select an Icon to better identify your Collection</p>
					<div class="arrow variant-filled-secondary" />
				</div>

				<input
					type="text"
					id="icon"
					bind:value={searchQuery}
					placeholder="Search for an icon..."
					use:popup={popupIcon}
					on:input={searchIcons}
					class="input dark:text-white"
				/>

				<!-- Display selected icon -->
				{#if iconselected}
					<div class="flex items-center justify-center gap-4">
						<!-- todo: display icon.name -->
						<iconify-icon icon={iconselected} width="30" class="text-primary-500" />
						<p class="dark:text-white">
							Name: <span class="text-primary-500">{iconselected}</span>
						</p>
					</div>
				{/if}
			</div>

			<!-- icon popup -->
			<div class="card z-10 w-96 p-4 shadow-xl" data-popup="popupIcon">
				<div>
					<div class=" mb-2 border-b text-center">
						<p class="text-primary-500">Select from Google Material Icons</p>
						<!-- todo: display hover  -->
						<iconify-icon {icon} width="30" class="text-error-500" />
					</div>
					<div class="grid grid-cols-5 gap-2">
						{#each icons as icon}
							<div class="relative flex flex-col items-center dark:text-white">
								<span class="iconify" data-icon={icon} data-inline="false" />
								<iconify-icon
									{icon}
									width="24"
									on:click={() => selectIcon(icon)}
									class="hover:text-primary-500 hover:cursor-pointer"
								/>
							</div>
						{/each}
					</div>

					<!-- Add buttons for pagination -->
					<!-- TODO Button Click will close popup -->
					<div class="mt-6 flex justify-between">
						<!-- Disable the previous button if the start index is zero -->
						<button
							disabled={start === 0}
							on:click={prevPage}
							class="btn btn-sm variant-filled-primary">Previous</button
						>
						<!-- Disable the next button if there are less than 50 icons in the current page -->
						<button
							disabled={icons.length < 50}
							on:click={nextPage}
							class="btn btn-sm variant-filled-primary">Next</button
						>
					</div>
				</div>
				<div class="arrow bg-surface-100-800-token" />
			</div>

			<!-- status -->
			<div class="mb-4 flex items-center gap-4">
				<label class="relative dark:text-white" for="status">
					Status:
					<iconify-icon
						icon="material-symbols:info"
						width="18"
						use:popup={TooltipStatus}
						class="absolute -top-3 right-1"
					/>
				</label>

				<!-- tooltip -->
				<div class="card p-4 variant-filled-secondary z-10" data-popup="TooltipStatus">
					<p>Choose how you Collection will be saved on creation</p>
					<div class="arrow variant-filled-secondary" />
				</div>

				<select id="status" bind:value={status} class="input dark:text-white">
					{#each statuses as statusOption}
						<option value={statusOption.value}> {statusOption.label}</option>
					{/each}
				</select>
			</div>

			<!-- slug -->
			<div class="mb-4 flex items-center gap-4">
				<label class="relative dark:text-white">
					Slug:
					<iconify-icon
						icon="material-symbols:info"
						width="18"
						use:popup={TooltipSlug}
						class="absolute -top-3 right-1"
					/>
				</label>

				<!-- tooltip -->
				<div class="card p-4 variant-filled-secondary z-10" data-popup="TooltipSlug">
					<p>Define the slug for your Url Path</p>
					<div class="arrow variant-filled-secondary" />
				</div>

				<input
					type="text"
					id="slug"
					bind:value={slug}
					placeholder="Path for collection..."
					on:input={onSlugInput}
					class="input dark:text-white"
				/>
			</div>
		</div>
	{/if}

	<!-- Add Input Widgets -->
	{#if !lockedWidget}
		<div class="border border-primary-500 rounded-md p-2 dark:text-white">
			<p class="font-bold mb-2">Add Input from Widget:</p>
			<p class="text-center">Drag to change order:</p>

			<!-- Input Widgets -->
			<!-- TODO: Add widgets names -->
			<!-- TODO: Allow deletion -->
			<div class="border border-primary-500 rounded-md p-2 text-center flex flex-col">
				Current Input Widgets

				{#each selectedWidgets as selectedWidget, index}
					<input
						class="input autocomplete mb-2"
						type="search"
						name="autocomplete-search"
						bind:value={inputPopupWidgets[index]}
						use:popup={popupSettings}
						placeholder="Select Widget..."
					/>

					<div data-popup="popupAutocomplete" class="bg-surface-500 w-full text-white">
						<Autocomplete
							bind:input={inputPopupWidgets[index]}
							on:selection={(event) => onPopupWidgetSelect(event, index)}
						/>
					</div>
				{/each}

				<button class="btn variant-filled-primary" on:click|preventDefault={onAddWidgetClick}
					>Add Input Widget
				</button>
			</div>
		</div>
	{/if}

	<!-- Buttons -->
	<div class="flex justify-between">
		<button
			class="btn bg-secondary-500 text-white px-4 py-2 rounded"
			on:click|preventDefault={cancel}>Cancel</button
		>

		{#if !lockedName && lockedWidget}
			<button
				on:click|preventDefault={checkInputWidget}
				class="btn bg-primary-500 text-white px-4 py-2 rounded">Add Collection Fields</button
			>
		{/if}

		{#if !lockedName && !lockedWidget}
			<button
				class="btn bg-secondary-500 text-white px-4 py-2 rounded"
				on:click|preventDefault={back}>back</button
			>
			<button type="submit" class="btn bg-primary-500 text-white px-4 py-2 rounded"
				>Create Collection</button
			>
		{/if}
	</div>
</form>

<style>
	.options-table {
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 1rem;
	}
	.options-table label {
		text-transform: capitalize;
	}
	.options-table input[type='text'],
	.options-table input[type='number'] {
		max-width: 24rem;
	}

	label {
		min-width: 100px;
	}
</style>
