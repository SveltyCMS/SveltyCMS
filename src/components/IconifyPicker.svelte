<!-- 
@file src/components/IconifyPicker.svelte
@component
**IconifyPicker component for selecting icons from Iconify libraries**

```tsx
<IconifyPicker bind:iconselected />
```

### Props
- `iconselected` {string} - Selected icon name
- `searchQuery` {string} - Search query for icons

@features Search icons, pagination, library selection, icon preview
-->

<script lang="ts">
	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Import loadIcons function from Iconify Svelte library
	import { loadIcons } from '@iconify/svelte';
	import { onDestroy } from 'svelte';

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

	// Debounced search function
	function debouncedSearch(query: string, library: string) {
		if (searchTimeout) clearTimeout(searchTimeout);
		searchTimeout = window.setTimeout(() => {
			searchIcons(query, library);
		}, 300);
	}

	// Fetch icons from Iconify API
	async function searchIcons(query: string, libraryCategory: string) {
		isLoading = true;
		searchError = null;
		start = page * 50;
		showDropdown = true;

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
		}
	}

	// Pagination handlers
	function nextPage() {
		page += 1;
		searchIcons(searchQuery, selectedLibrary);
	}

	function prevPage() {
		page = Math.max(0, page - 1);
		searchIcons(searchQuery, selectedLibrary);
	}

	// Icon selection handler
	function selectIcon(icon: string) {
		iconselected = icon;
		showDropdown = false;
	}

	// Remove selected icon
	function removeIcon() {
		iconselected = '';
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
		<div class="-mt-3 mb-1 flex items-center justify-start gap-2">
			<div class="flex items-center gap-3 p-2">
				<iconify-icon icon={iconselected} width="30" class="py-2 text-tertiary-500" aria-hidden="true"></iconify-icon>
				<p>
					{m.iconpicker_name()}
					<span class="text-tertiary-500 dark:text-primary-500">{iconselected}</span>
				</p>
			</div>
			<button onmouseup={removeIcon} type="button" aria-label="Remove Icon" class="variant-ghost btn-icon">
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
		class="input w-full text-black dark:text-primary-500"
		oninput={() => debouncedSearch(searchQuery, selectedLibrary)}
		onfocus={showLibrariesAndDropdown}
		aria-label="Search icons"
		aria-controls="icon-dropdown"
		aria-describedby={searchError ? 'search-error' : undefined}
	/>

	{#if searchError}
		<div id="search-error" class="mt-2 rounded bg-error-500/10 p-2 text-error-500" role="alert">
			{searchError}
		</div>
	{/if}

	<!-- Dropdown section -->
	{#if showDropdown}
		<div id="icon-dropdown" class="dropdown" role="listbox">
			<!-- Library filter dropdown -->
			<div class="mb-2">
				<select
					bind:value={selectedLibrary}
					onclick={getIconLibraries}
					onchange={() => {
						start = 0;
						searchIcons(searchQuery, selectedLibrary);
					}}
					class="input mt-2 w-full"
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

			{#if isLoading}
				<div class="flex justify-center p-4">
					<iconify-icon icon="eos-icons:loading" class="animate-spin" width="24"></iconify-icon>
				</div>
			{:else}
				<!-- Icon selection buttons -->
				<div class="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10" role="group">
					{#each icons as icon}
						<button
							onclick={() => selectIcon(icon)}
							type="button"
							class="flex items-center justify-center p-2 hover:rounded hover:bg-primary-500"
							aria-label={`Select icon ${icon}`}
							role="option"
							aria-selected={iconselected === icon}
						>
							<iconify-icon {icon} width="24" aria-hidden="true"></iconify-icon>
						</button>
					{/each}
				</div>

				<!-- Pagination buttons -->
				{#if icons.length > 0}
					<div class="mt-2 flex justify-between">
						<button
							disabled={page === 0}
							onclick={prevPage}
							class={`${page === 0 ? 'hidden' : 'block'} variant-filled-primary btn-sm rounded`}
							aria-label="Previous page"
						>
							{m.button_previous()}
						</button>

						<div class="dark:text-white" role="status">
							Showing Icons: <span class="text-primary-500">{icons.length}</span>
						</div>

						<button
							disabled={icons.length < 50}
							onclick={nextPage}
							class={`${icons.length < 50 ? 'hidden' : 'block'} variant-filled-primary btn-sm rounded`}
							aria-label="Next page"
						>
							{m.button_next()}
						</button>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>
