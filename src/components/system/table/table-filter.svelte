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
	import Button from '@components/ui/button.svelte';
	import FloatingInput from '@components/ui/floating-input.svelte';
	// Stores

	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import {
		table_clear_search,
		table_column_toggle,
		table_density_label,
		table_density_toggle,
		table_filter_toggle,
		table_search_aria,
		table_search_placeholder,
		table_search_toggle
	} from '@src/paraglide/messages';
	import { app } from '@src/stores/store.svelte';
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
	function closeOpenStates(except: 'search' | 'filter' | 'column' | 'density' | undefined = undefined) {
		if (except !== 'search') {
			searchShow = false;
		}
		if (except !== 'filter') {
			filterShow = false;
		}
		if (except !== 'column') {
			columnShow = false;
		}
		app.translationStatusOpen = false;
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
		<FloatingInput
			autofocus={searchShow}
			bind:value={globalSearchValue}
			label={table_search_placeholder()}
			icon="material-symbols:search-rounded"
			aria-label={table_search_aria()}
			onkeydown={(e) => e.key === 'Enter' && closeOpenStates()}
			inputClass="h-full border-none bg-transparent dark:text-surface-50 dark:bg-surface-800"
		/>
		<Button variant="surface"
			onclick={() => {
				globalSearchValue = '';
				searchShow = false;
			}}
			onkeydown={(event: KeyboardEvent) => {
				if (event.key === 'Enter' || event.key === ' ') {
					globalSearchValue = '';
					searchShow = false;
				}
			}}
			aria-label={table_clear_search()}
		 class="w-10 flex items-center justify-center">
			<iconify-icon icon="ic:outline-search-off" width={24}></iconify-icon>
		</Button>
	</div>
{:else}
	<SystemTooltip title={table_search_toggle()}>
		<Button variant="outline"
			type="button"
			onclick={() => {
				searchShow = !searchShow;
				if (searchShow) closeOpenStates('search');
			}}
			aria-label={table_search_toggle()}
		 class="rounded-full">
			<iconify-icon icon="material-symbols:search-rounded" width={24}></iconify-icon>
		</Button>
	</SystemTooltip>

	<!-- Filter -->
	<SystemTooltip title={table_filter_toggle()}>
		<Button variant="outline"
			type="button"
			onclick={() => {
				filterShow = !filterShow;
				if (filterShow) closeOpenStates('filter');
			}}
			aria-label={table_filter_toggle()}
		 class="rounded-full">
			<iconify-icon icon="carbon:filter-edit" width={24}></iconify-icon>
		</Button>
	</SystemTooltip>

	<!-- Column Order & Visibility -->
	<SystemTooltip title={table_column_toggle()}>
		<Button variant="outline"
			type="button"
			onclick={() => {
				columnShow = !columnShow;
				if (columnShow) closeOpenStates('column');
			}}
			aria-label={table_column_toggle()}
		 class="rounded-full">
			<iconify-icon icon="fluent:column-triple-edit-24-regular" width={24}></iconify-icon>
		</Button>
	</SystemTooltip>

	<!-- Spacing/Density -->
	<SystemTooltip title={table_density_label({ density: getDensityDisplayName() })}>
		<Button variant="outline"
			type="button"
			onclick={() => {
				cycleDensity();
				closeOpenStates('density');
			}}
			aria-label={table_density_toggle()}
		 class="rounded-full">
			<iconify-icon icon={getDensityIcon()} width={24}></iconify-icon>
		</Button>
	</SystemTooltip>
{/if}
