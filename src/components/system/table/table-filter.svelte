<!-- 
@file src/components/system/table/table-filter.svelte
@component
**Optimized table filter component for search, filter, and column controls in a CMS.**

This component provides a lightweight, flexible interface for table filtering.  
It includes search, filter toggles, column visibility, and density controls, optimized for performance and reusability.

@example
<TableFilter bind:globalSearchValue bind:searchShow bind:filterShow bind:columnShow bind:density />

### Props
- `globalSearchValue` {string}: Current value of the global search input (default: '')
- `searchShow` {boolean}: Visibility of the search input (default: false)
- `filterShow` {boolean}: Visibility of filter controls (default: false)
- `columnShow` {boolean}: Visibility of column controls (default: false)
- `density` {string}: Table density ('compact', 'normal', 'comfortable') (default: 'normal')
- `densityOptions` {string[]}: Custom density options (default: ['compact', 'normal', 'comfortable'])
- `showDeleted` {boolean}: Whether to show deleted items (default: false)

### Features
- Provides a responsive layout for table filtering controls
- Supports dynamic updates to filter and search criteria
- Allows customization of table density and column visibility
- Integrates with global search and filter states
- Optimized for performance with minimal re-renders
-->

<script lang="ts">
	// Stores
	import { app } from '@src/stores/store.svelte';
	import {
		table_search_placeholder,
		table_search_aria,
		table_clear_search,
		table_search_toggle,
		table_filter_toggle,
		table_column_toggle,
		table_density_label,
		table_density_toggle
	} from '@src/paraglide/messages';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	// Logger
	import { logger } from '@utils/logger';
	// Using iconify-icon web component
	import { browser } from '$app/environment';

	// Props with types
	let {
		globalSearchValue = $bindable(''),
		searchShow = $bindable(false),
		filterShow = $bindable(false),
		columnShow = $bindable(false),
		density = $bindable('normal'),
		densityOptions = $bindable(['compact', 'normal', 'comfortable']),
		showDeleted = $bindable(false)
	} = $props();

	let searchInput = $state<HTMLInputElement>();

	$effect(() => {
		if (searchShow && searchInput) {
			searchInput.focus();
		}
	});

	// Storage key for user settings
	const USER_SETTINGS_KEY = 'userTableSettings';

	// Load density from localStorage on component mount
	$effect(() => {
		if (browser) {
			try {
				const settings = JSON.parse(localStorage.getItem(USER_SETTINGS_KEY) || '{}');
				if (settings.density && densityOptions.includes(settings.density)) {
					density = settings.density;
				}
			} catch (e) {
				logger.error('Failed to load user table settings', e);
				// Keep default if error
			}
		}
	});

	// Store user settings when density changes
	$effect(() => {
		if (browser && density) {
			try {
				const settings = JSON.parse(localStorage.getItem(USER_SETTINGS_KEY) || '{}');
				settings.density = density;
				localStorage.setItem(USER_SETTINGS_KEY, JSON.stringify(settings));
			} catch (e) {
				logger.error('Failed to save user table settings', e);
			}
		}
	});

	// Function to close all open states except the specified one
	function closeOpenStates(except?: 'search' | 'filter' | 'column' | 'density') {
		if (except !== 'search') {
			searchShow = false;
		}
		if (except !== 'filter') {
			filterShow = false;
		}
		if (except !== 'column') {
			columnShow = false;
		}
		app.setTranslationStatusOpen(false);
	}

	// Function to cycle density
	function cycleDensity() {
		const currentIndex = densityOptions.indexOf(density);
		const nextIndex = (currentIndex + 1) % densityOptions.length;
		density = densityOptions[nextIndex];
	}

	// Get density display name with first letter capitalized
	function getDensityDisplayName() {
		return density.charAt(0).toUpperCase() + density.slice(1);
	}

	// Function to get density icon based on current setting
	function getDensityIcon() {
		switch (density) {
			case 'compact':
				return 'material-symbols:align-space-even-rounded';
			case 'normal':
				return 'material-symbols:align-space-around-rounded';
			case 'comfortable':
				return 'material-symbols:align-space-between-rounded';
			default:
				return 'material-symbols:align-space-around-rounded';
		}
	}
</script>

<!-- Expanding Search -->
{#if searchShow}
	<div class="input-group input-group-divider grid grid-cols-[1fr_auto] h-10 w-full max-w-xs sm:max-w-sm transition-all duration-300 z-50">
		<input
			bind:this={searchInput}
			type="text"
			placeholder={table_search_placeholder()}
			aria-label={table_search_aria()}
			bind:value={globalSearchValue}
			onkeydown={(e) => e.key === 'Enter' && closeOpenStates()}
			class="input w-full h-full outline-none border-none bg-transparent px-4 transition-all duration-500 ease-in-out focus:border-tertiary-500 dark:text-surface-50 dark:bg-surface-800 dark:focus:border-primary-500"
		/>
		<button
			onclick={() => {
				globalSearchValue = '';
				searchShow = false;
			}}
			onkeydown={(event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					globalSearchValue = '';
					searchShow = false;
				}
			}}
			aria-label={table_clear_search()}
			class="preset-filled-surface-500 w-10 flex items-center justify-center"
		>
			<iconify-icon icon="ic:outline-search-off" width={24}></iconify-icon>
		</button>
	</div>
{:else}
	<SystemTooltip title={table_search_toggle()}>
		<button
			type="button"
			onclick={() => {
				searchShow = !searchShow;
				if (searchShow) closeOpenStates('search');
			}}
			aria-label={table_search_toggle()}
			class="btn preset-outlined-surface-500 rounded-full"
		>
			<iconify-icon icon="material-symbols:search-rounded" width={24}></iconify-icon>
		</button>
	</SystemTooltip>

	<!-- Filter -->
	<SystemTooltip title={table_filter_toggle()}>
		<button
			type="button"
			onclick={() => {
				filterShow = !filterShow;
				if (filterShow) closeOpenStates('filter');
			}}
			aria-label={table_filter_toggle()}
			class="btn preset-outlined-surface-500 rounded-full"
		>
			<iconify-icon icon="carbon:filter-edit" width={24}></iconify-icon>
		</button>
	</SystemTooltip>

	<!-- Column Order & Visibility -->
	<SystemTooltip title={table_column_toggle()}>
		<button
			type="button"
			onclick={() => {
				columnShow = !columnShow;
				if (columnShow) closeOpenStates('column');
			}}
			aria-label={table_column_toggle()}
			class="btn preset-outlined-surface-500 rounded-full"
		>
			<iconify-icon icon="fluent:column-triple-edit-24-regular" width={24}></iconify-icon>
		</button>
	</SystemTooltip>

	<!-- Spacing/Density -->
	<SystemTooltip title={table_density_label({ density: getDensityDisplayName() })}>
		<button
			type="button"
			onclick={() => {
				cycleDensity();
				closeOpenStates('density');
			}}
			aria-label={table_density_toggle()}
			class="btn preset-outlined-surface-500 rounded-full"
		>
			<iconify-icon icon={getDensityIcon()} width={24}></iconify-icon>
		</button>
	</SystemTooltip>
{/if}
