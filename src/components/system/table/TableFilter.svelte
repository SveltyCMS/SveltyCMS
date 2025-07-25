<!-- 
@file src/components/system/table/TableFilter.svelte
@component
**Optimized table filter component for search, filter, and column controls in a CMS.**

This component provides a lightweight, flexible interface for table filtering, using Svelte 5 runes for reactivity and bindable props for two-way data flow. It includes search, filter toggles, column visibility, and density controls, optimized for performance and reusability.

@example
<TableFilter bind:globalSearchValue bind:searchShow bind:filterShow bind:columnShow bind:density />

#### Props
- `globalSearchValue` {string}: Current value of the global search input (default: '')
- `searchShow` {boolean}: Visibility of the search input (default: false)
- `filterShow` {boolean}: Visibility of filter controls (default: false)
- `columnShow` {boolean}: Visibility of column controls (default: false)
- `density` {string}: Table density ('compact', 'normal', 'comfortable') (default: 'normal')
- `densityOptions` {string[]}: Custom density options (default: ['compact', 'normal', 'comfortable'])
-->

<script lang="ts">
	import { browser } from '$app/environment';

	// Stores
	import { setTranslationStatusOpen } from '@stores/store.svelte';

	// Props with types
	let {
		globalSearchValue = $bindable(''),
		searchShow = $bindable(false),
		filterShow = $bindable(false),
		columnShow = $bindable(false),
		density = $bindable('normal'),
		densityOptions = $bindable(['compact', 'normal', 'comfortable']),
		showDeleted = $bindable(false)
	} = $props<{
		globalSearchValue?: string;
		searchShow?: boolean;
		filterShow?: boolean;
		columnShow?: boolean;
		density?: string;
		densityOptions?: string[];
		showDeleted?: boolean;
	}>();

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
				console.error('Failed to load user table settings', e);
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
				console.error('Failed to save user table settings', e);
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
		setTranslationStatusOpen(false);
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
	<div class="input-group input-group-divider grid grid-cols-[auto_1fr_auto]">
		<input
			type="text"
			placeholder="Search..."
			aria-label="Search for items in the table"
			bind:value={globalSearchValue}
			onkeydown={(e) => e.key === 'Enter' && closeOpenStates()}
			class="input outline-none transition-all duration-500 ease-in-out"
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
			aria-label="Clear Search"
			class="variant-filled-surface w-12"
		>
			<iconify-icon icon="ic:outline-search-off" width="24"></iconify-icon>
		</button>
	</div>
{:else}
	<button
		type="button"
		onclick={() => {
			searchShow = !searchShow;
			if (searchShow) closeOpenStates('search');
		}}
		aria-label="Search"
		title="Search"
		class="variant-ghost-surface btn-icon"
	>
		<iconify-icon icon="material-symbols:search-rounded" width="24" class={searchShow ? 'text-primary-500' : ''}></iconify-icon>
	</button>

	<!-- Filter -->
	<button
		type="button"
		onclick={() => {
			filterShow = !filterShow;
			if (filterShow) closeOpenStates('filter');
		}}
		aria-label="Toggle Column Filters"
		title="Column Filters"
		class="variant-ghost-surface btn-icon"
	>
		<iconify-icon icon="carbon:filter-edit" width="24" class={filterShow ? 'text-primary-500' : ''}></iconify-icon>
	</button>

	{#if filterShow}
		<!-- Show Deleted Checkbox (only when filter is expanded) -->
		<label class="ml-2 flex cursor-pointer items-center gap-2 text-sm">
			<input type="checkbox" bind:checked={showDeleted} />
			Show Deleted
		</label>
	{/if}

	<!-- Column Order & Visibility -->
	<button
		type="button"
		onclick={() => {
			columnShow = !columnShow;
			if (columnShow) closeOpenStates('column');
		}}
		aria-label="Toggle Column Visibility/Order"
		title="Manage Columns"
		class="variant-ghost-surface btn-icon"
	>
		<iconify-icon icon="fluent:column-triple-edit-24-regular" width="24" class={columnShow ? 'text-primary-500' : ''}></iconify-icon>
	</button>

	<!-- Spacing/Density -->
	<button
		type="button"
		onclick={() => {
			cycleDensity();
			closeOpenStates('density');
		}}
		aria-label="Cycle Table Density"
		title={`Density: ${getDensityDisplayName()}`}
		class="variant-ghost-surface btn-icon"
	>
		<iconify-icon icon={getDensityIcon()} width="24"></iconify-icon>
	</button>
{/if}
