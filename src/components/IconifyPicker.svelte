<!-- 
@file src/components/IconifyPicker.svelte
@component
**IconifyPicker component for selecting icons from Iconify libraries**

@example
<IconifyPicker bind:iconselected />

### Props
- `iconselected` {string} - Selected icon name
- `searchQuery` {string} - Search query for icons

@features Search icons, pagination, library selection, icon preview, smooth animations
-->

<script lang="ts">
	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Import loadIcons function from Iconify Svelte library
	import { loadIcons } from '@iconify/svelte';
	import { onDestroy } from 'svelte';
	import { tweened } from 'svelte/motion';
	import { cubicOut, quintOut } from 'svelte/easing';

	interface Props {
		iconselected: string;
		searchQuery?: string;
	}

	interface IconLibrary {
		name: string;
		total: number;
		prefix?: string;
		version?: string;
		author?: string;
		license?: string;
		samples?: string[];
		height?: number;
		displayHeight?: number;
		category?: string;
		palette?: boolean;
		hidden?: boolean;
	}

	let { iconselected = $bindable(), searchQuery = $bindable('') }: Props = $props();

	// State variables
	let icons = $state<string[]>([]);
	let start = $state(0);
	let selectedLibrary = $state('ic');
	let librariesLoaded = $state(false);
	let iconLibraries = $state<Record<string, IconLibrary>>({});
	let page = $state(0);
	let showDropdown = $state(false);
	let isLoading = $state(false);
	let searchError = $state<string | null>(null);
	let searchTimeout: number | undefined;

	// Animation stores
	const dropdownOpacity = tweened(0, {
		duration: 200,
		easing: cubicOut
	});

	const dropdownScale = tweened(0.95, {
		duration: 200,
		easing: cubicOut
	});

	const selectedIconScale = tweened(1, {
		duration: 150,
		easing: quintOut
	});

	const gridOpacity = tweened(0, {
		duration: 300,
		easing: cubicOut
	});

	// Animate dropdown visibility
	$effect(() => {
		if (showDropdown) {
			dropdownOpacity.set(1);
			dropdownScale.set(1);
		} else {
			dropdownOpacity.set(0);
			dropdownScale.set(0.95);
		}
	});

	// Animate grid when icons change
	$effect(() => {
		if (icons.length > 0) {
			gridOpacity.set(1);
		} else {
			gridOpacity.set(0);
		}
	});

	// Animate selected icon
	$effect(() => {
		if (iconselected) {
			selectedIconScale.set(1.1);
			setTimeout(() => selectedIconScale.set(1), 150);
		}
	});

	// Debounced search function
	function debouncedSearch(query: string, library: string) {
		if (searchTimeout) clearTimeout(searchTimeout);

		// Show loading immediately for better UX
		if (query.trim()) {
			isLoading = true;
			gridOpacity.set(0.5);
		}

		searchTimeout = window.setTimeout(() => {
			searchIcons(query, library);
		}, 300);
	}

	// Fetch icons from Iconify API
	async function searchIcons(query: string, libraryCategory: string) {
		if (!query.trim()) {
			icons = [];
			isLoading = false;
			return;
		}

		isLoading = true;
		searchError = null;
		start = page * 50;
		showDropdown = true;

		// Smooth transition out
		await gridOpacity.set(0.3);

		try {
			const response = await fetch(
				`https://api.iconify.design/search?query=${encodeURIComponent(query)}&prefix=${libraryCategory || 'ic'}&start=${start}`
			);

			if (!response.ok) {
				throw new Error(`API error: ${response.status}`);
			}

			const data = await response.json();

			if (data && data.icons) {
				icons = data.icons;
				await loadIcons(icons.map((icon) => `${data.prefix}:${icon}`));
			} else {
				icons = [];
			}
		} catch (error) {
			console.error('Error fetching icons:', error);
			searchError = error instanceof Error ? error.message : 'Error fetching icons';
			icons = [];
		} finally {
			isLoading = false;
			// Smooth transition in
			await gridOpacity.set(1);
		}
	}

	// Pagination handlers
	async function nextPage() {
		page += 1;
		await gridOpacity.set(0.3);
		await searchIcons(searchQuery, selectedLibrary);
	}

	async function prevPage() {
		page = Math.max(0, page - 1);
		await gridOpacity.set(0.3);
		await searchIcons(searchQuery, selectedLibrary);
	}

	// Icon selection handler
	function selectIcon(icon: string) {
		iconselected = icon;
		showDropdown = false;

		// Animate selection
		selectedIconScale.set(1.2);
		setTimeout(() => selectedIconScale.set(1), 200);
	}

	// Remove selected icon
	function removeIcon() {
		iconselected = '';
		selectedIconScale.set(0.8);
		setTimeout(() => selectedIconScale.set(1), 150);
	}

	// Fetch available icon libraries
	async function getIconLibraries() {
		if (librariesLoaded) return;

		isLoading = true;
		searchError = null;

		try {
			const response = await fetch('https://api.iconify.design/collections');
			if (!response.ok) {
				throw new Error(`Failed to fetch icon libraries: ${response.status}`);
			}

			const data = await response.json();
			iconLibraries = data;
			librariesLoaded = true;
		} catch (error) {
			console.error('Error fetching icon libraries:', error);
			searchError = error instanceof Error ? error.message : 'Error fetching libraries';
		} finally {
			isLoading = false;
		}
	}

	// Show dropdown and fetch libraries
	function showLibrariesAndDropdown() {
		getIconLibraries();
		showDropdown = true;
	}

	// Cleanup
	onDestroy(() => {
		if (searchTimeout) clearTimeout(searchTimeout);
	});
</script>

<div class="flex w-full flex-col">
	<!-- Display selected icon -->
	{#if iconselected}
		<div
			class="-mt-3 mb-1 flex items-center justify-start gap-2 transition-all duration-200"
			style="transform: scale({$selectedIconScale}); transform-origin: left center;"
		>
			<div class="flex items-center gap-3 p-2">
				<iconify-icon
					icon={iconselected}
					width="30"
					class="py-2 text-tertiary-500 transition-transform duration-200 hover:scale-110"
					aria-hidden="true"
				></iconify-icon>
				<p class="transition-colors duration-200">
					{m.iconpicker_name()}
					<span class="font-medium text-tertiary-500 dark:text-primary-500">{iconselected}</span>
				</p>
			</div>
			<button
				onmouseup={removeIcon}
				type="button"
				aria-label="Remove Icon"
				class="variant-ghost btn-icon transition-all duration-200 hover:scale-110 hover:bg-error-500/10 hover:text-error-500"
			>
				<iconify-icon icon="icomoon-free:bin" width="22" aria-hidden="true"></iconify-icon>
			</button>
		</div>
	{/if}

	<!-- Icon search input -->
	<input
		type="text"
		id="icon"
		bind:value={searchQuery}
		placeholder={iconselected ? `Replace Icon: ${iconselected}` : m.iconpicker_placeholder()}
		class="input w-full text-black transition-all duration-200 focus:scale-[1.02] focus:shadow-lg dark:text-primary-500"
		oninput={() => debouncedSearch(searchQuery, selectedLibrary)}
		onfocus={showLibrariesAndDropdown}
		aria-label="Search icons"
		aria-controls="icon-dropdown"
		aria-describedby={searchError ? 'search-error' : undefined}
	/>

	{#if searchError}
		<div
			id="search-error"
			class="mt-2 animate-pulse rounded border-l-4 border-error-500 bg-error-500/10 p-2 text-error-500 transition-all duration-300"
			role="alert"
		>
			{searchError}
		</div>
	{/if}

	<!-- Dropdown section -->
	{#if showDropdown}
		<div
			id="icon-dropdown"
			class="dropdown mt-2 overflow-hidden rounded-lg border border-surface-200 bg-surface-50 shadow-xl dark:border-surface-700 dark:bg-surface-800"
			role="listbox"
			style="opacity: {$dropdownOpacity}; transform: scale({$dropdownScale}); transform-origin: top;"
		>
			<!-- Library filter dropdown -->
			<div class="border-b border-surface-200 p-4 dark:border-surface-700">
				<select
					bind:value={selectedLibrary}
					onclick={getIconLibraries}
					onchange={async () => {
						start = 0;
						page = 0;
						await gridOpacity.set(0.3);
						await searchIcons(searchQuery, selectedLibrary);
					}}
					class="input w-full transition-all duration-200 hover:scale-[1.01]"
					aria-label="Select icon library"
					disabled={isLoading}
				>
					{#if librariesLoaded}
						{#each Object.entries(iconLibraries) as [library, data]}
							<option value={library}>
								{data.name}: {library}/{data.total}
							</option>
						{/each}
					{/if}
				</select>
			</div>

			<div class="p-4">
				{#if isLoading}
					<div class="flex justify-center p-8">
						<iconify-icon icon="eos-icons:loading" class="animate-spin text-primary-500" width="32"></iconify-icon>
					</div>
				{:else}
					<!-- Icon selection buttons -->
					<div
						class="grid grid-cols-6 gap-2 transition-opacity duration-300 sm:grid-cols-8 md:grid-cols-10"
						role="group"
						style="opacity: {$gridOpacity};"
					>
						{#each icons as icon, index}
							<button
								onclick={() => selectIcon(icon)}
								type="button"
								class="flex items-center justify-center rounded-lg p-3 transition-all duration-200 hover:scale-110 hover:bg-primary-500/10 focus:outline-none focus:ring-2 focus:ring-primary-500 active:scale-95"
								aria-label={`Select icon ${icon}`}
								role="option"
								aria-selected={iconselected === icon}
								style="animation-delay: {index * 20}ms;"
							>
								<iconify-icon {icon} width="24" aria-hidden="true" class="transition-all duration-200 hover:text-primary-500"></iconify-icon>
							</button>
						{/each}
					</div>

					<!-- Pagination buttons -->
					{#if icons.length > 0}
						<div class="mt-6 flex items-center justify-between border-t border-surface-200 pt-4 dark:border-surface-700">
							<button
								disabled={page === 0}
								onclick={prevPage}
								class={`${page === 0 ? 'pointer-events-none opacity-0' : 'opacity-100'} variant-filled-primary btn-sm rounded transition-all duration-200 hover:scale-105 active:scale-95`}
								aria-label="Previous page"
							>
								{m.button_previous()}
							</button>

							<div class="font-medium dark:text-white" role="status">
								Showing Icons: <span class="font-bold text-primary-500">{icons.length}</span>
							</div>

							<button
								disabled={icons.length < 50}
								onclick={nextPage}
								class={`${icons.length < 50 ? 'pointer-events-none opacity-0' : 'opacity-100'} variant-filled-primary btn-sm rounded transition-all duration-200 hover:scale-105 active:scale-95`}
								aria-label="Next page"
							>
								{m.button_next()}
							</button>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</div>
