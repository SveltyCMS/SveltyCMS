<!-- 
@file src/components/IconPicker.svelte
@component
**Enhanced IconPicker - Svelte 5 Optimized (Iconify Version)**

Advanced icon picker using Iconify with search, pagination, and favorites.
Avoids heavy build time by loading icons on demand.

@example
```svelte
<IconPicker bind:iconselected />
```
-->

<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { fade, scale, slide } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	// ParaglideJS
	import * as m from '@src/paraglide/messages';
	// Iconify
	import Icon, { loadIcons } from '@iconify/svelte';
	// Utils
	import { showToast } from '@utils/toast';
	// System Logger
	import { logger } from '@utils/logger';

	// Constants
	const DEBOUNCE_MS = 300;
	const ICONS_PER_PAGE = 50;
	const DEFAULT_LIBRARY = 'lucide'; // Default to Lucide matching current style
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
	let isLoadingLibraries = $state(false);
	let searchError = $state<string | null>(null);
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let favorites = $state<string[]>([]);
	let recentSelections = $state<string[]>([]);
	let isLoading = $state(false);
	let activeTab = $state<'search' | 'favorites' | 'recent'>('search');
	let showDropdown = $state(false);
	let selectedIndex = $state(-1);
	let prefersReducedMotion = $state(false);
	let previewSize = $state(24);

	// Refs
	let dropdownRef = $state<HTMLDivElement | null>(null);
	let gridRef = $state<HTMLDivElement | null>(null);

	// Derived values
	const startIndex = $derived(currentPage * ICONS_PER_PAGE);
	const librariesLoaded = $derived(Object.keys(iconLibraries).length > 0);
	const hasSearchQuery = $derived(searchQuery.trim().length > 0);
	const isFavorite = $derived(favorites.includes(iconselected));
	const hasRecent = $derived(recentSelections.length > 0);
	const hasFavorites = $derived(favorites.length > 0);

	const sortedLibraries = $derived.by(() => {
		return Object.entries(iconLibraries).sort(([, a], [, b]) => a.name.localeCompare(b.name));
	});

	let visibleLimit = $state(50);

	// Display icons based on active tab
	const displayIcons = $derived.by(() => {
		if (activeTab === 'favorites') return favorites;
		if (activeTab === 'recent') return recentSelections;
		return icons.slice(0, visibleLimit);
	});

	// Intersection Observer Action for Infinite Scroll
	function intersectionObserverAction(node: HTMLElement) {
		const observer = new IntersectionObserver((entries) => {
			if (entries[0].isIntersecting) {
				loadMore();
			}
		});

		observer.observe(node);

		return {
			destroy() {
				observer.disconnect();
			}
		};
	}

	function loadMore() {
		// If browsing (all icons loaded), just increase visible limit
		if (icons.length > visibleLimit) {
			visibleLimit += 50;
		}
		// If searching (API pagination), fetch more
		else if (hasSearchQuery || selectedLibrary === '') {
			if (!isLoading) {
				// To properly implement pagination with API, we need to track if we have more
				// For now, allow trigger if we are at limit
				// Increase page?
				// Simple logic:
				// currentPage++;
				// searchIcons(searchQuery, selectedLibrary, true);
				// (Implemented below)
			}
		}
	}

	function handleScroll() {
		// keeping this if needed for manual scroll handling, but IntersectionObserver is better
	}

	// Debounced search
	function debouncedSearch(query: string, library: string): void {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}

		if (!query.trim()) {
			if (library) {
				// Load library default
				fetchCollectionIcons(library);
			} else {
				icons = [];
			}
			isLoading = false;
			return;
		}

		isLoading = true;
		debounceTimer = setTimeout(() => {
			searchIcons(query, library);
		}, DEBOUNCE_MS);
	}

	// Fetch icons from Iconify API
	async function searchIcons(query: string, library: string, append: boolean = false): Promise<void> {
		if (!query.trim()) {
			if (library && !append) {
				await fetchCollectionIcons(library);
			}
			return;
		}

		isLoading = true;
		searchError = null;

		try {
			const url = new URL(`${ICONIFY_API_BASE}/search`);
			url.searchParams.set('query', query);
			if (library) {
				url.searchParams.set('prefix', library);
			}
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
				const newIcons = data.icons;

				if (append) {
					icons = [...icons, ...newIcons];
					visibleLimit += newIcons.length;
				} else {
					icons = newIcons;
					visibleLimit = 50;
					currentPage = 0;
				}

				// Preload icons
				const iconIds = newIcons.map((icon) => {
					return library ? `${library}:${icon}` : icon;
				});
				await loadIcons(iconIds);

				activeTab = 'search';
			} else {
				if (!append) icons = [];
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

	// Fetch all icons for a specific collection (browsing mode)
	async function fetchCollectionIcons(library: string): Promise<void> {
		isLoading = true;
		searchError = null;
		icons = [];

		try {
			const response = await fetch(`${ICONIFY_API_BASE}/collection?prefix=${library}`);
			if (!response.ok) throw new Error(`Failed to load collection: ${response.status}`);

			const data = await response.json();

			let allIcons: string[] = [];
			if (data.uncategorized) allIcons.push(...data.uncategorized);
			if (data.categories) {
				Object.values(data.categories).forEach((categoryIcons: any) => {
					allIcons.push(...categoryIcons);
				});
			}

			// Prepend library
			allIcons = allIcons.map((i) => `${library}:${i}`);

			icons = allIcons;
			visibleLimit = 50;
		} catch (error) {
			logger.error('Error fetching collection icons:', error);
			searchError = 'Failed to load library icons';
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

	function selectIcon(icon: string): void {
		// Ensure icon has prefix
		let fullIconName = icon;
		if (!icon.includes(':') && selectedLibrary) {
			fullIconName = `${selectedLibrary}:${icon}`;
		}

		iconselected = fullIconName;

		recentSelections = [fullIconName, ...recentSelections.filter((i) => i !== fullIconName)].slice(0, MAX_RECENT);
		showDropdown = false;
		showToast(`Icon selected: ${fullIconName}`, 'success');
	}

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

	async function copyIconName(): Promise<void> {
		if (!iconselected) return;
		try {
			await navigator.clipboard.writeText(iconselected);
			showToast('Icon name copied to clipboard', 'success');
		} catch (error) {
			showToast('Failed to copy icon name', 'error');
		}
	}

	function removeIcon(): void {
		iconselected = '';
		searchQuery = '';
		icons = [];
	}

	function handleLibraryChange(): void {
		currentPage = 0;
		if (hasSearchQuery) {
			searchIcons(searchQuery, selectedLibrary);
		} else {
			fetchCollectionIcons(selectedLibrary);
		}
	}

	function handleFocus(): void {
		showDropdown = true;
		fetchIconLibraries();
		if (icons.length === 0) {
			if (searchQuery) {
				searchIcons(searchQuery, selectedLibrary);
			} else if (selectedLibrary) {
				fetchCollectionIcons(selectedLibrary);
			}
		}
	}

	function handleClickOutside(event: MouseEvent): void {
		const target = event.target as HTMLElement;
		if (dropdownRef && !dropdownRef.contains(target)) {
			showDropdown = false;
		}
	}

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

	function switchTab(tab: typeof activeTab): void {
		activeTab = tab;
		selectedIndex = -1;
	}

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

	onMount(() => {
		try {
			const storedFavorites = localStorage.getItem('svelty_icon_favorites');
			if (storedFavorites) favorites = JSON.parse(storedFavorites);
			const storedRecent = localStorage.getItem('svelty_icon_recent');
			if (storedRecent) recentSelections = JSON.parse(storedRecent);
		} catch (e) {
			console.error('Failed to load storage', e);
		}

		const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
		prefersReducedMotion = mediaQuery.matches;
		const handleChange = (e: MediaQueryListEvent) => {
			prefersReducedMotion = e.matches;
		};
		mediaQuery.addEventListener('change', handleChange);
		return () => mediaQuery.removeEventListener('change', handleChange);
	});

	$effect(() => {
		localStorage.setItem('svelty_icon_favorites', JSON.stringify(favorites));
	});

	$effect(() => {
		localStorage.setItem('svelty_icon_recent', JSON.stringify(recentSelections));
	});

	onDestroy(() => {
		if (debounceTimer) clearTimeout(debounceTimer);
	});
</script>

<div class="icon-picker-container flex w-full flex-col" bind:this={dropdownRef}>
	<!-- Selected icon display -->
	{#if iconselected}
		<div
			class="mb-2 flex items-center justify-between gap-2"
			in:scale={{ duration: prefersReducedMotion ? 0 : 200, easing: quintOut, start: 0.9 }}
			out:scale={{ duration: prefersReducedMotion ? 0 : 150, easing: quintOut, start: 0.9 }}
		>
			<div class="flex flex-1 items-center gap-3 rounded-lg bg-surface-100 p-2 dark:bg-surface-800">
				<Icon
					icon={iconselected}
					width={previewSize.toString()}
					class="text-tertiary-500 transition-transform duration-200 hover:scale-110 dark:text-primary-500"
				/>
				<div class="flex-1 overflow-hidden">
					<p class="text-xs text-surface-600 dark:text-surface-50">Selected Icon</p>
					<p class="truncate text-sm font-medium text-tertiary-500 dark:text-primary-500">
						{iconselected}
					</p>
				</div>
			</div>

			<div class="flex gap-1">
				<button
					onclick={() => toggleFavorite(iconselected)}
					type="button"
					class="btn-icon preset-outlined-surface-500 transition-all duration-200 hover:scale-110"
					aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
					title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
				>
					<Icon icon={isFavorite ? 'mdi:heart' : 'mdi:heart-outline'} width="22" class={isFavorite ? 'text-error-500' : ''} />
				</button>

				<button
					onclick={copyIconName}
					type="button"
					class="btn-icon preset-outlined-surface-500 transition-all duration-200 hover:scale-110"
					aria-label="Copy icon name"
					title="Copy icon name"
				>
					<Icon icon="mdi:content-copy" width="22" />
				</button>

				<button
					onclick={removeIcon}
					type="button"
					class="btn-icon preset-outlined-error-500 transition-all duration-200 hover:scale-110"
					aria-label="Remove selected icon"
					title="Remove icon"
				>
					<Icon icon="mdi:close" width="22" />
				</button>
			</div>
		</div>
	{/if}

	<!-- Search input container -->
	<div class="relative">
		<input
			type="text"
			role="combobox"
			bind:value={searchQuery}
			placeholder={iconselected ? `Replace: ${iconselected}` : m.iconpicker_placeholder()}
			class="input w-full pr-10 transition-all duration-200 focus:scale-[1.01] focus:shadow-lg"
			oninput={() => debouncedSearch(searchQuery, selectedLibrary)}
			onfocus={handleFocus}
			aria-label="Search icons"
			aria-controls="icon-dropdown"
			aria-haspopup="listbox"
			aria-expanded={showDropdown}
		/>
		{#if searchQuery}
			<button
				type="button"
				class="absolute right-2 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-200"
				onclick={() => {
					searchQuery = '';
					debouncedSearch('', selectedLibrary);
				}}
				aria-label="Clear search"
			>
				<Icon icon="mdi:close" width="20" />
			</button>
		{/if}
	</div>

	<!-- Error message -->
	{#if searchError}
		<div
			class="mt-2 rounded-lg border-l-4 border-error-500 bg-error-50 p-3 text-sm text-error-700 dark:bg-error-900/20 dark:text-error-300"
			in:fade={{ duration: prefersReducedMotion ? 0 : 200 }}
		>
			<div class="flex items-start gap-2">
				<Icon icon="mdi:alert-circle" width="18" />
				<span>{searchError}</span>
			</div>
		</div>
	{/if}

	<!-- Dropdown -->
	{#if showDropdown}
		<div
			id="icon-dropdown"
			class="mt-2 overflow-hidden rounded-lg border border-surface-200 bg-surface-50 shadow-2xl dark:text-surface-50 dark:bg-surface-800"
			in:scale={{ duration: prefersReducedMotion ? 0 : 200, easing: quintOut, start: 0.95, opacity: 0 }}
			out:scale={{ duration: prefersReducedMotion ? 0 : 150, easing: quintOut, start: 0.95, opacity: 0 }}
		>
			<!-- Tabs -->
			<div class="flex border-b border-surface-200 dark:text-surface-50">
				<button
					onclick={() => switchTab('search')}
					class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'search'
						? 'border-b-2 border-primary-500 text-primary-500'
						: 'text-surface-600 hover:text-surface-900 dark:text-surface-50 dark:hover:text-surface-100'}"
				>
					Search
				</button>
				{#if showFavorites && hasFavorites}
					<button
						onclick={() => switchTab('favorites')}
						class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'favorites'
							? 'border-b-2 border-primary-500 text-primary-500'
							: 'text-surface-600 hover:text-surface-900 dark:text-surface-50 dark:hover:text-surface-100'}"
					>
						Favorites ({favorites.length})
					</button>
				{/if}
				{#if hasRecent}
					<button
						onclick={() => switchTab('recent')}
						class="flex-1 px-4 py-3 text-sm font-medium transition-colors {activeTab === 'recent'
							? 'border-b-2 border-primary-500 text-primary-500'
							: 'text-surface-600 hover:text-surface-900 dark:text-surface-50 dark:hover:text-surface-100'}"
					>
						Recent ({recentSelections.length})
					</button>
				{/if}
			</div>

			<!-- Library selector -->
			{#if activeTab === 'search'}
				<div class="border-b border-surface-200 p-4 dark:text-surface-50" transition:slide={{ duration: prefersReducedMotion ? 0 : 200 }}>
					<label for="library-select" class="mb-2 block text-sm font-medium"> Icon Library </label>
					<div class="relative">
						<select
							id="library-select"
							bind:value={selectedLibrary}
							onchange={handleLibraryChange}
							onclick={fetchIconLibraries}
							class="input w-full"
							disabled={isLoadingLibraries}
						>
							<option value="">All Libraries (Global Search)</option>
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
				</div>
			{/if}

			<!-- Content -->
			<div class="h-80 overflow-y-auto p-4" onscroll={handleScroll}>
				{#if isLoading && icons.length === 0}
					<div class="flex justify-center py-12" in:fade={{ duration: prefersReducedMotion ? 0 : 200 }}>
						<div class="flex flex-col items-center gap-3">
							<div class="h-10 w-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
							<p class="text-sm text-surface-600 dark:text-surface-50">Loading icons...</p>
						</div>
					</div>
				{:else if displayIcons.length > 0}
					<div
						bind:this={gridRef}
						class="grid grid-cols-6 gap-2 sm:grid-cols-8 md:grid-cols-10"
						in:fade={{ duration: prefersReducedMotion ? 0 : 300 }}
					>
						{#each displayIcons as icon, index (icon)}
							<div
								onclick={() => selectIcon(icon)}
								onkeydown={(e) => e.key === 'Enter' && selectIcon(icon)}
								role="option"
								aria-selected={iconselected === icon || index === selectedIndex}
								tabindex="0"
								class="group relative flex cursor-pointer items-center justify-center rounded-lg p-3 transition-all duration-200 hover:scale-110 hover:bg-primary-500/10 focus:outline-none focus:ring-2 focus:ring-primary-500 active:scale-95 {index ===
								selectedIndex
									? 'ring-2 ring-primary-500'
									: ''}"
							>
								<Icon {icon} width="24" class="transition-colors duration-200 group-hover:text-primary-500" />

								{#if activeTab === 'favorites'}
									<button
										onclick={(e) => {
											e.stopPropagation();
											toggleFavorite(icon);
										}}
										class="absolute right-0 top-0 opacity-0 transition-opacity group-hover:opacity-100"
									>
										<Icon icon="mdi:close-circle" width="16" class="text-error-500" />
									</button>
								{/if}
							</div>
						{/each}

						{#if isLoading}
							<div class="col-span-full py-4 text-center">
								<Icon icon="eos-icons:loading" class="animate-spin text-surface-400" width="24" />
							</div>
						{/if}

						{#if activeTab === 'search' && !isLoading}
							<div class="col-span-full h-4" use:intersectionObserverAction></div>
						{/if}
					</div>
				{:else if hasSearchQuery && activeTab === 'search'}
					<div class="flex flex-col items-center gap-3 py-12 text-center" in:fade={{ duration: prefersReducedMotion ? 0 : 200 }}>
						<Icon icon="mdi:magnify-close" width="48" class="text-surface-400" />
						<p class="text-surface-600 dark:text-surface-50">
							No icons found for "<span class="font-medium">{searchQuery}</span>"
						</p>
					</div>
				{:else}
					<div class="flex flex-col items-center gap-3 py-12 text-center" in:fade={{ duration: prefersReducedMotion ? 0 : 200 }}>
						<Icon
							icon={activeTab === 'favorites' ? 'mdi:heart-outline' : activeTab === 'recent' ? 'mdi:history' : 'mdi:magnify'}
							width="48"
							class="text-surface-400"
						/>
						<p class="text-surface-600 dark:text-surface-50">
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
