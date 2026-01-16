<!-- 
@file src/components/IconifyPicker.svelte
@component
**IconifyPicker component for selecting icons from Iconify libraries**

@example
<IconifyPicker bind:iconselected />

### Features
- Search icons with debounce
- Paginated results
- Select from multiple icon libraries
- Loading and error states
-->

<script lang="ts">
	import * as m from '@src/paraglide/messages';
	import { loadIcons } from '@iconify/svelte';
	import { logger } from '@utils/logger';
	import { onDestroy } from 'svelte';
	import { fade, scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';

	// Constants
	const DEBOUNCE_MS = 300;
	const ICONS_PER_PAGE = 50;
	const DEFAULT_LIBRARY = 'ic';
	const ICONIFY_API_BASE = 'https://api.iconify.design';

	// Types
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

	interface IconSearchResponse {
		icons: string[];
		total: number;
		limit: number;
		start: number;
		collections: Record<string, IconLibrary>;
		request: {
			query: string;
			limit: number;
			start: number;
			prefix: string;
		};
		prefix?: string;
	}

	interface Props {
		iconselected: string;
		searchQuery?: string;
	}

	let { iconselected = $bindable(), searchQuery = $bindable('') }: Props = $props();

	// State
	let icons = $state<string[]>([]);
	let currentPage = $state(0);
	let selectedLibrary = $state(DEFAULT_LIBRARY);
	let iconLibraries = $state<Record<string, IconLibrary>>({});
	let showDropdown = $state(false);
	let isLoading = $state(false);
	let isLoadingLibraries = $state(false);
	let searchError = $state<string | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;

	// Derived values
	const hasIcons = $derived(icons.length > 0);
	const canGoPrevious = $derived(currentPage > 0);
	const canGoNext = $derived(icons.length >= ICONS_PER_PAGE);
	const startIndex = $derived(currentPage * ICONS_PER_PAGE);
	const librariesLoaded = $derived(Object.keys(iconLibraries).length > 0);
	const hasSearchQuery = $derived(searchQuery.trim().length > 0);

	const sortedLibraries = $derived.by(() => {
		return Object.entries(iconLibraries).sort(([, a], [, b]) => a.name.localeCompare(b.name));
	});

	// Debounced search
	function debouncedSearch(query: string, library: string): void {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}

		if (!query.trim()) {
			icons = [];
			isLoading = false;
			return;
		}

		isLoading = true;
		debounceTimer = setTimeout(() => {
			searchIcons(query, library);
		}, DEBOUNCE_MS);
	}

	// Fetch icons from Iconify API
	async function searchIcons(query: string, library: string): Promise<void> {
		if (!query.trim()) {
			icons = [];
			isLoading = false;
			return;
		}

		isLoading = true;
		searchError = null;

		try {
			const url = new URL(`${ICONIFY_API_BASE}/search`);
			url.searchParams.set('query', query);
			url.searchParams.set('prefix', library || DEFAULT_LIBRARY);
			url.searchParams.set('start', startIndex.toString());
			url.searchParams.set('limit', ICONS_PER_PAGE.toString());

			const response = await fetch(url.toString());

			if (!response.ok) {
				throw new Error(`API error: ${response.status} ${response.statusText}`);
			}

			const data: IconSearchResponse = await response.json();

			if (data?.icons && Array.isArray(data.icons)) {
				icons = data.icons;

				// Preload icons for better UX
				const iconIds = icons.map((icon) => `${data.prefix || library}:${icon}`);
				await loadIcons(iconIds);
			} else {
				icons = [];
			}
		} catch (error) {
			logger.error('Error fetching icons:', error);
			searchError = error instanceof Error ? error.message : 'Failed to fetch icons';
			icons = [];
		} finally {
			isLoading = false;
		}
	}

	// Fetch available icon libraries
	async function fetchIconLibraries(): Promise<void> {
		if (librariesLoaded || isLoadingLibraries) return;

		isLoadingLibraries = true;
		searchError = null;

		try {
			const response = await fetch(`${ICONIFY_API_BASE}/collections`);

			if (!response.ok) {
				throw new Error(`Failed to fetch libraries: ${response.status}`);
			}

			const data: Record<string, IconLibrary> = await response.json();
			iconLibraries = data;
		} catch (error) {
			logger.error('Error fetching icon libraries:', error);
			searchError = error instanceof Error ? error.message : 'Failed to load libraries';
		} finally {
			isLoadingLibraries = false;
		}
	}

	// Navigation handlers
	function nextPage(): void {
		if (!canGoNext) return;
		currentPage += 1;
		searchIcons(searchQuery, selectedLibrary);
	}

	function previousPage(): void {
		if (!canGoPrevious) return;
		currentPage -= 1;
		searchIcons(searchQuery, selectedLibrary);
	}

	// Icon selection
	function selectIcon(icon: string): void {
		iconselected = `${selectedLibrary}:${icon}`;
		showDropdown = false;
	}

	function removeIcon(): void {
		iconselected = '';
		searchQuery = '';
		icons = [];
	}

	// Library change handler
	function handleLibraryChange(): void {
		currentPage = 0;
		if (hasSearchQuery) {
			searchIcons(searchQuery, selectedLibrary);
		}
	}

	// Show dropdown and load libraries
	function handleFocus(): void {
		showDropdown = true;
		fetchIconLibraries();
	}

	// Close dropdown when clicking outside
	function handleClickOutside(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		if (!target.closest('.icon-picker-container')) {
			showDropdown = false;
		}
	}

	// Setup click outside listener
	$effect(() => {
		if (showDropdown) {
			document.addEventListener('click', handleClickOutside);
			return () => document.removeEventListener('click', handleClickOutside);
		}
	});

	// Cleanup
	onDestroy(() => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
	});
</script>

<div class="icon-picker-container flex w-full flex-col">
	<!-- Selected icon display -->
	{#if iconselected}
		<div
			class="-mt-3 mb-1 flex items-center justify-start gap-2"
			in:scale={{ duration: 200, easing: quintOut, start: 0.9 }}
			out:scale={{ duration: 150, easing: quintOut, start: 0.9 }}
		>
			<div class="flex items-center gap-3 rounded-lg bg-surface-100 p-2 dark:bg-surface-800">
				<iconify-icon
					icon={iconselected}
					width="30"
					class="text-tertiary-500 transition-transform duration-200 hover:scale-110 dark:text-primary-500"
					aria-hidden="true"
				></iconify-icon>
				<p class="text-sm">
					<span class="text-surface-600 dark:text-surface-400">{m.iconpicker_name()}</span>
					<span class="font-medium text-tertiary-500 dark:text-primary-500">{iconselected}</span>
				</p>
			</div>
			<button
				onclick={removeIcon}
				type="button"
				aria-label="Remove selected icon"
				class="preset-ghost btn-icon transition-all duration-200 hover:scale-110 hover:bg-error-500/10 hover:text-error-500"
			>
				<iconify-icon icon="icomoon-free:bin" width="22" aria-hidden="true"></iconify-icon>
			</button>
		</div>
	{/if}

	<!-- Search input -->
	<input
		type="text"
		role="combobox"
		bind:value={searchQuery}
		placeholder={iconselected ? `Replace: ${iconselected}` : m.iconpicker_placeholder()}
		class="input w-full transition-all duration-200 focus:scale-[1.01] focus:shadow-lg"
		oninput={() => debouncedSearch(searchQuery, selectedLibrary)}
		onfocus={handleFocus}
		aria-label="Search icons"
		aria-controls="icon-dropdown"
		aria-haspopup="listbox"
		aria-expanded={showDropdown}
		aria-describedby={searchError ? 'search-error' : undefined}
	/>

	<!-- Error message -->
	{#if searchError}
		<div
			id="search-error"
			class="mt-2 rounded border-l-4 border-error-500 bg-error-500/10 p-3 text-sm text-error-500"
			role="alert"
			in:fade={{ duration: 200 }}
		>
			{searchError}
		</div>
	{/if}

	<!-- Dropdown -->
	{#if showDropdown}
		<div
			id="icon-dropdown"
			class="mt-2 overflow-hidden rounded-lg border border-surface-200 bg-surface-50 shadow-xl dark:border-surface-700 dark:bg-surface-800"
			role="region"
			aria-label="Icon picker dropdown"
			in:scale={{ duration: 200, easing: quintOut, start: 0.95, opacity: 0 }}
			out:scale={{ duration: 150, easing: quintOut, start: 0.95, opacity: 0 }}
		>
			<!-- Library selector -->
			<div class="border-b border-surface-200 p-4 dark:border-surface-700">
				<label for="library-select" class="mb-2 block text-sm font-medium"> Icon Library </label>
				<select
					id="library-select"
					bind:value={selectedLibrary}
					onchange={handleLibraryChange}
					onclick={fetchIconLibraries}
					class="input w-full"
					disabled={isLoadingLibraries}
					aria-label="Select icon library"
				>
					{#if !librariesLoaded}
						<option value={DEFAULT_LIBRARY}>Loading libraries...</option>
					{:else}
						{#each sortedLibraries as [prefix, library] (prefix)}
							<option value={prefix}>
								{library.name} ({prefix}) — {library.total.toLocaleString()} icons
							</option>
						{/each}
					{/if}
				</select>
			</div>

			<!-- Icon grid or loading state -->
			<div class="p-4">
				{#if isLoading}
					<div class="flex justify-center py-12" in:fade={{ duration: 200 }}>
						<div class="flex flex-col items-center gap-3">
							<iconify-icon icon="eos-icons:loading" class="animate-spin text-primary-500" width="40" aria-hidden="true"></iconify-icon>
							<p class="text-sm text-surface-600 dark:text-surface-400">Loading icons...</p>
						</div>
					</div>
				{:else if hasIcons}
					<!-- Icon grid -->
					<div class="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10" role="listbox" aria-label="Available icons" in:fade={{ duration: 300 }}>
						{#each icons as icon (icon)}
							<button
								onclick={() => selectIcon(icon)}
								type="button"
								class="flex items-center justify-center rounded-lg p-3 transition-all duration-200 hover:scale-110 hover:bg-primary-500/10 focus:outline-none focus:ring-2 focus:ring-primary-500 active:scale-95"
								aria-label={`Select icon ${icon}`}
								role="option"
								aria-selected={iconselected === `${selectedLibrary}:${icon}`}
							>
								<iconify-icon
									icon={`${selectedLibrary}:${icon}`}
									width="24"
									aria-hidden="true"
									class="transition-colors duration-200 hover:text-primary-500"
								></iconify-icon>
							</button>
						{/each}
					</div>

					<!-- Pagination -->
					<div class="mt-6 flex items-center justify-between border-t border-surface-200 pt-4 dark:border-surface-700">
						<button
							onclick={previousPage}
							disabled={!canGoPrevious}
							class="preset-filled-primary-500 btn btn-sm transition-all duration-200 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-0"
							aria-label="Previous page"
						>
							{m.button_previous()}
						</button>

						<div class="text-sm font-medium" role="status" aria-live="polite">
							Showing <span class="font-bold text-primary-500">{icons.length}</span> icons
						</div>

						<button
							onclick={nextPage}
							disabled={!canGoNext}
							class="preset-filled-primary-500 btn btn-sm transition-all duration-200 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-0"
							aria-label="Next page"
						>
							{m.button_next()}
						</button>
					</div>
				{:else if hasSearchQuery}
					<div class="flex flex-col items-center gap-3 py-12 text-center" in:fade={{ duration: 200 }}>
						<iconify-icon icon="mdi:magnify-close" width="48" class="text-surface-400" aria-hidden="true"></iconify-icon>
						<p class="text-surface-600 dark:text-surface-400">
							No icons found for "<span class="font-medium">{searchQuery}</span>"
						</p>
					</div>
				{:else}
					<div class="flex flex-col items-center gap-3 py-12 text-center" in:fade={{ duration: 200 }}>
						<iconify-icon icon="mdi:magnify" width="48" class="text-surface-400" aria-hidden="true"></iconify-icon>
						<p class="text-surface-600 dark:text-surface-400">Start typing to search icons</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
