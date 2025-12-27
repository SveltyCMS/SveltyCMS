<!-- 
@file src/components/IconifyPicker.svelte
@component
**Enhanced IconifyPicker - Svelte 5 Optimized**

Advanced icon picker with search, pagination, and favorites.

@example
```svelte
<IconifyPicker bind:iconselected />
```

### Features
- Debounced search with performance optimization
- Paginated results with smooth loading
- Multiple icon library support
- Favorite icons (in-memory)
- Recent selections history
- Keyboard navigation (Arrow keys, Enter, Escape)
- Copy icon name to clipboard
- Preview mode with size adjustment
- Full ARIA accessibility
- Reduced motion support
-->

<script lang="ts">
	import * as m from '@src/paraglide/messages';
	import { loadIcons } from '@iconify/svelte';
	import { logger } from '@utils/logger';
	import { onMount, onDestroy } from 'svelte';
	import { fade, scale, slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { showToast } from '@utils/toast';

	// Constants
	const DEBOUNCE_MS = 300;
	const ICONS_PER_PAGE = 50;
	const DEFAULT_LIBRARY = 'ic';
	const ICONIFY_API_BASE = 'https://api.iconify.design';
	const MAX_RECENT = 10;

	// Types
	interface IconLibrary {
		name: string;
		total: number;
		prefix?: string;
		author?: string;
		license?: string;
		category?: string;
	}

	interface IconSearchResponse {
		icons: string[];
		total: number;
		limit: number;
		start: number;
		collections: Record<string, IconLibrary>;
		prefix?: string;
	}

	interface Props {
		iconselected: string;
		searchQuery?: string;
		showFavorites?: boolean;
	}

	let { iconselected = $bindable(), searchQuery = $bindable(''), showFavorites = true }: Props = $props();

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
	let favorites = $state<string[]>([]);
	let recentSelections = $state<string[]>([]);
	let selectedIndex = $state(-1);
	let activeTab = $state<'search' | 'favorites' | 'recent'>('search');
	let prefersReducedMotion = $state(false);
	let previewSize = $state(24);

	// Refs
	let dropdownRef = $state<HTMLDivElement | null>(null);
	let gridRef = $state<HTMLDivElement | null>(null);

	// Derived values
	// Removed unused 'hasIcons'
	const canGoPrevious = $derived(currentPage > 0);
	const canGoNext = $derived(icons.length >= ICONS_PER_PAGE);
	const startIndex = $derived(currentPage * ICONS_PER_PAGE);
	const librariesLoaded = $derived(Object.keys(iconLibraries).length > 0);
	const hasSearchQuery = $derived(searchQuery.trim().length > 0);
	const isFavorite = $derived(favorites.includes(iconselected));
	const hasRecent = $derived(recentSelections.length > 0);
	const hasFavorites = $derived(favorites.length > 0);

	const sortedLibraries = $derived.by(() => {
		return Object.entries(iconLibraries).sort(([, a], [, b]) => a.name.localeCompare(b.name));
	});

	// Display icons based on active tab
	const displayIcons = $derived.by(() => {
		if (activeTab === 'favorites') return favorites;
		if (activeTab === 'recent') return recentSelections;
		return icons;
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

			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 10000);

			const response = await fetch(url.toString(), {
				signal: controller.signal
			});

			clearTimeout(timeout);

			if (!response.ok) {
				throw new Error(`API error: ${response.status}`);
			}

			const data: IconSearchResponse = await response.json();

			if (data?.icons && Array.isArray(data.icons)) {
				icons = data.icons;

				// Preload icons for better UX
				const iconIds = icons.map((icon) => `${data.prefix || library}:${icon}`);
				await loadIcons(iconIds);

				activeTab = 'search';
			} else {
				icons = [];
			}
		} catch (error) {
			if (error instanceof Error && error.name === 'AbortError') {
				searchError = 'Search timeout - please try again';
			} else {
				logger.error('Error fetching icons:', error);
				searchError = 'Failed to fetch icons';
			}
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
			const controller = new AbortController();
			const timeout = setTimeout(() => controller.abort(), 10000);

			const response = await fetch(`${ICONIFY_API_BASE}/collections`, {
				signal: controller.signal
			});

			clearTimeout(timeout);

			if (!response.ok) {
				throw new Error(`Failed to fetch libraries: ${response.status}`);
			}

			const data: Record<string, IconLibrary> = await response.json();
			iconLibraries = data;
		} catch (error) {
			logger.error('Error fetching icon libraries:', error);
			searchError = 'Failed to load libraries';
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
		const fullIconName = icon.includes(':') ? icon : `${selectedLibrary}:${icon}`;
		iconselected = fullIconName;

		// Add to recent (avoiding duplicates)
		recentSelections = [fullIconName, ...recentSelections.filter((i) => i !== fullIconName)].slice(0, MAX_RECENT);

		showDropdown = false;
		showToast(`Icon selected: ${fullIconName}`, 'success');
	}

	// Favorites management
	function toggleFavorite(icon?: string): void {
		const targetIcon = icon || iconselected;
		if (!targetIcon) return;

		if (favorites.includes(targetIcon)) {
			favorites = favorites.filter((i) => i !== targetIcon);
			showToast('Removed from favorites', 'info');
		} else {
			favorites = [...favorites, targetIcon];
			showToast('Added to favorites', 'success');
		}
	}

	// Copy icon name
	async function copyIconName(): Promise<void> {
		if (!iconselected) return;

		try {
			await navigator.clipboard.writeText(iconselected);
			showToast('Icon name copied to clipboard', 'success');
		} catch (error) {
			logger.error('Copy failed:', error);
			showToast('Failed to copy icon name', 'error');
		}
	}

	// Remove icon
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

	// Show dropdown
	function handleFocus(): void {
		showDropdown = true;
		fetchIconLibraries();
	}

	// Close dropdown
	function handleClickOutside(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		if (dropdownRef && !dropdownRef.contains(target)) {
			showDropdown = false;
		}
	}

	// Keyboard navigation
	function handleKeyDown(event: KeyboardEvent): void {
		if (!showDropdown) return;

		const iconsToNavigate = displayIcons;

		switch (event.key) {
			case 'Escape':
				event.preventDefault();
				showDropdown = false;
				break;

			case 'ArrowDown':
				event.preventDefault();
				selectedIndex = Math.min(selectedIndex + 1, iconsToNavigate.length - 1);
				scrollToSelected();
				break;

			case 'ArrowUp':
				event.preventDefault();
				selectedIndex = Math.max(selectedIndex - 1, -1);
				scrollToSelected();
				break;

			case 'Enter':
				event.preventDefault();
				if (selectedIndex >= 0 && iconsToNavigate[selectedIndex]) {
					selectIcon(iconsToNavigate[selectedIndex]);
				}
				break;
		}
	}

	// Scroll to selected icon
	function scrollToSelected(): void {
		if (!gridRef || selectedIndex < 0) return;

		const selectedElement = gridRef.children[selectedIndex] as HTMLElement;
		if (selectedElement) {
			selectedElement.scrollIntoView({
				block: 'nearest',
				behavior: prefersReducedMotion ? 'auto' : 'smooth'
			});
		}
	}

	// Switch tabs
	function switchTab(tab: typeof activeTab): void {
		activeTab = tab;
		selectedIndex = -1;
	}

	// Effects
	$effect(() => {
		if (showDropdown) {
			document.addEventListener('click', handleClickOutside);
			document.addEventListener('keydown', handleKeyDown);
			return () => {
				document.removeEventListener('click', handleClickOutside);
				document.removeEventListener('keydown', handleKeyDown);
			};
		}
	});

	// Lifecycle
	onMount(() => {
		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mediaQuery.matches;

		const handleChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};

		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	});

	onDestroy(() => {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}
	});
</script>

<div class="icon-picker-container flex w-full flex-col" bind:this={dropdownRef}>
	<!-- Selected icon display -->
	{#if iconselected}
		<div
			class="-mt-3 mb-2 flex items-center justify-between gap-2"
			in:scale={{ duration: prefersReducedMotion ? 0 : 200, easing: quintOut, start: 0.9 }}
			out:scale={{ duration: prefersReducedMotion ? 0 : 150, easing: quintOut, start: 0.9 }}
		>
			<div class="flex flex-1 items-center gap-3 rounded-lg bg-surface-100 p-2 dark:bg-surface-800">
				<iconify-icon
					icon={iconselected}
					width={previewSize}
					class="text-tertiary-500 transition-transform duration-200 hover:scale-110 dark:text-primary-500"
					aria-hidden="true"
				></iconify-icon>
				<div class="flex-1 overflow-hidden">
					<p class="text-xs text-surface-600 dark:text-surface-400">Selected Icon</p>
					<p class="truncate text-sm font-medium text-tertiary-500 dark:text-primary-500">
						{iconselected}
					</p>
				</div>
			</div>

			<div class="flex gap-1">
				<button
					onclick={() => toggleFavorite(iconselected)}
					type="button"
					class="btn-icon variant-ghost transition-all duration-200 hover:scale-110"
					aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
					title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
				>
					<iconify-icon icon={isFavorite ? 'mdi:heart' : 'mdi:heart-outline'} width="22" class={isFavorite ? 'text-error-500' : ''}></iconify-icon>
				</button>

				<button
					onclick={copyIconName}
					type="button"
					class="btn-icon variant-ghost transition-all duration-200 hover:scale-110"
					aria-label="Copy icon name"
					title="Copy icon name"
				>
					<iconify-icon icon="mdi:content-copy" width="22"></iconify-icon>
				</button>

				<button
					onclick={removeIcon}
					type="button"
					class="btn-icon variant-ghost-error transition-all duration-200 hover:scale-110"
					aria-label="Remove selected icon"
					title="Remove icon"
				>
					<iconify-icon icon="mdi:close" width="22"></iconify-icon>
				</button>
			</div>
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
			class="mt-2 rounded-lg border-l-4 border-error-500 bg-error-50 p-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-300"
			role="alert"
			in:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
		>
			<div class="flex items-start gap-2">
				<iconify-icon icon="mdi:alert-circle" width="18" aria-hidden="true"></iconify-icon>
				<span>{searchError}</span>
			</div>
		</div>
	{/if}

	<!-- Dropdown -->
	{#if showDropdown}
		<div
			id="icon-dropdown"
			class="mt-2 overflow-hidden rounded-lg border border-surface-200 bg-surface-50 shadow-2xl dark:border-surface-700 dark:bg-surface-800"
			role="region"
			aria-label="Icon picker dropdown"
			in:scale={{ duration: prefersReducedMotion ? 0 : 200, easing: quintOut, start: 0.95, opacity: 0 }}
			out:scale={{ duration: prefersReducedMotion ? 0 : 150, easing: quintOut, start: 0.95, opacity: 0 }}
		>
			<!-- Tabs -->
			<div class="flex border-b border-surface-200 dark:border-surface-700" role="tablist">
				<button
					role="tab"
					aria-selected={activeTab === 'search'}
					onclick={() => switchTab('search')}
					class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'search'
						? 'border-b-2 border-primary-500 text-primary-500'
						: 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100'}"
				>
					Search
				</button>
				{#if showFavorites && hasFavorites}
					<button
						role="tab"
						aria-selected={activeTab === 'favorites'}
						onclick={() => switchTab('favorites')}
						class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'favorites'
							? 'border-b-2 border-primary-500 text-primary-500'
							: 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100'}"
					>
						Favorites ({favorites.length})
					</button>
				{/if}
				{#if hasRecent}
					<button
						role="tab"
						aria-selected={activeTab === 'recent'}
						onclick={() => switchTab('recent')}
						class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'recent'
							? 'border-b-2 border-primary-500 text-primary-500'
							: 'text-surface-600 hover:text-surface-900 dark:text-surface-400 dark:hover:text-surface-100'}"
					>
						Recent ({recentSelections.length})
					</button>
				{/if}
			</div>

			<!-- Library selector (only for search tab) -->
			{#if activeTab === 'search'}
				<div class="border-b border-surface-200 p-4 dark:border-surface-700" transition:slide={{ duration: prefersReducedMotion ? 0 : 200 }}>
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
			{/if}

			<!-- Content -->
			<div class="p-4">
				{#if isLoading}
					<!-- Loading state -->
					<div class="flex justify-center py-12" in:fade={{ duration: prefersReducedMotion ? 0 : 200 }}>
						<div class="flex flex-col items-center gap-3">
							<div class="h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
							<p class="text-sm text-surface-600 dark:text-surface-400">Loading icons...</p>
						</div>
					</div>
				{:else if displayIcons.length > 0}
					<!-- Icon grid -->
					<div
						bind:this={gridRef}
						class="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10"
						role="listbox"
						aria-label="Available icons"
						in:fade={{ duration: prefersReducedMotion ? 0 : 300 }}
					>
						{#each displayIcons as icon, index (icon)}
							{@const fullIconName = icon.includes(':') ? icon : `${selectedLibrary}:${icon}`}
							<div
								onclick={() => selectIcon(icon)}
								onkeydown={(e) => e.key === 'Enter' && selectIcon(icon)}
								role="option"
								aria-selected={iconselected === fullIconName || index === selectedIndex}
								tabindex="0"
								class="group relative flex cursor-pointer items-center justify-center rounded-lg p-3 transition-all duration-200 hover:scale-110 hover:bg-primary-500/10 focus:outline-none focus:ring-2 focus:ring-primary-500 active:scale-95 {index ===
								selectedIndex
									? 'ring-2 ring-primary-500'
									: ''}"
								aria-label={`Select icon ${fullIconName}`}
							>
								<iconify-icon icon={fullIconName} width="24" aria-hidden="true" class="transition-colors duration-200 group-hover:text-primary-500"
								></iconify-icon>

								{#if activeTab === 'favorites'}
									<button
										onclick={(e) => {
											e.stopPropagation();
											toggleFavorite(icon);
										}}
										class="absolute right-0 top-0 opacity-0 transition-opacity group-hover:opacity-100"
										aria-label="Remove from favorites"
									>
										<iconify-icon icon="mdi:close-circle" width="16" class="text-error-500"></iconify-icon>
									</button>
								{/if}
							</div>
						{/each}
					</div>

					<!-- Pagination (only for search) -->
					{#if activeTab === 'search'}
						<div
							class="mt-6 flex items-center justify-between border-t border-surface-200 pt-4 dark:border-surface-700"
							transition:slide={{ duration: prefersReducedMotion ? 0 : 200 }}
						>
							<button
								onclick={previousPage}
								disabled={!canGoPrevious}
								class="variant-filled-primary btn btn-sm transition-all duration-200 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-0"
								aria-label="Previous page"
							>
								{m.button_previous()}
							</button>

							<div class="text-sm font-medium" role="status" aria-live="polite">
								Showing <span class="font-bold text-primary-500">{displayIcons.length}</span> icons
							</div>

							<button
								onclick={nextPage}
								disabled={!canGoNext}
								class="variant-filled-primary btn btn-sm transition-all duration-200 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-0"
								aria-label="Next page"
							>
								{m.button_next()}
							</button>
						</div>
					{/if}
				{:else if hasSearchQuery && activeTab === 'search'}
					<!-- No results -->
					<div class="flex flex-col items-center gap-3 py-12 text-center" in:fade={{ duration: prefersReducedMotion ? 0 : 200 }}>
						<iconify-icon icon="mdi:magnify-close" width="48" class="text-surface-400" aria-hidden="true"></iconify-icon>
						<p class="text-surface-600 dark:text-surface-400">
							No icons found for "<span class="font-medium">{searchQuery}</span>"
						</p>
					</div>
				{:else}
					<!-- Empty state -->
					<div class="flex flex-col items-center gap-3 py-12 text-center" in:fade={{ duration: prefersReducedMotion ? 0 : 200 }}>
						<iconify-icon
							icon={activeTab === 'favorites' ? 'mdi:heart-outline' : activeTab === 'recent' ? 'mdi:history' : 'mdi:magnify'}
							width="48"
							class="text-surface-400"
							aria-hidden="true"
						></iconify-icon>
						<p class="text-surface-600 dark:text-surface-400">
							{#if activeTab === 'favorites'}
								No favorite icons yet
							{:else if activeTab === 'recent'}
								No recent selections
							{:else}
								Start typing to search icons
							{/if}
						</p>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</div>
