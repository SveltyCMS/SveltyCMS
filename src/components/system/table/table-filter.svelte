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
- `viewMode` {'table' | 'card'}: Current view mode, one-way — the toggle reports through `onViewModeChange`
- `onViewModeChange` {(mode) => void}: Called with the requested mode when the view toggle is pressed

### Features
- Provides a responsive layout for table filtering controls
- Supports dynamic updates to filter and search criteria
- Allows customization of table density and column visibility
- Integrates with global search and filter states
- Search opens alongside the toolbar instead of replacing it (filter/column/density stay mounted); `Escape` closes it and returns focus to the toggle
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
		table_search_toggle,
		table_switch_to_card_view,
		table_switch_to_table_view
	} from '@src/paraglide/messages';
	// Logger
	import { logger } from '@utils/logger';
	// Using iconify-icon web component
	import { browser } from '$app/env';

	// Props with types
	let {
		globalSearchValue = $bindable(''),
		searchShow = $bindable(false),
		filterShow = $bindable(false),
		columnShow = $bindable(false),
		density = $bindable('normal'),
		densityOptions = $bindable(['compact', 'normal', 'comfortable']),
		viewMode = 'table',
		showViewMode = false,
		onViewModeChange
	}: {
		globalSearchValue?: string;
		searchShow?: boolean;
		filterShow?: boolean;
		columnShow?: boolean;
		density?: string;
		densityOptions?: string[];
		viewMode?: 'table' | 'card';
		showViewMode?: boolean;
		onViewModeChange?: (mode: 'table' | 'card') => void;
	} = $props();

	// Storage key for user settings
	const USER_SETTINGS_KEY = 'userTableSettings';

	/**
	 * Read the persisted density preference.
	 *
	 * Called from component initialisation, not an effect: applying the saved
	 * density after mount changes every row's padding at once (a visible reflow
	 * on every collection/user/access table).
	 */
	function readSavedDensity(): string | null {
		if (!browser) return null;
		try {
			const settings = JSON.parse(localStorage.getItem(USER_SETTINGS_KEY) || '{}');
			return typeof settings.density === 'string' ? settings.density : null;
		} catch (e) {
			logger.error('Failed to load user table settings', e);
			return null;
		}
	}

	const savedDensity = readSavedDensity();
	if (savedDensity && densityOptions.includes(savedDensity) && savedDensity !== density) {
		density = savedDensity;
	}

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
	function closeOpenStates(
		except: 'search' | 'filter' | 'column' | 'density' | undefined = undefined
	) {
		if (except !== 'search') {
			searchShow = false;
		}
		if (except !== 'filter') {
			filterShow = false;
		}
		if (except !== 'column') {
			columnShow = false;
		}
	}

	// Function to cycle density
	function cycleDensity() {
		const currentIndex = densityOptions.indexOf(density);
		const nextIndex = (currentIndex + 1) % densityOptions.length;
		density = densityOptions[nextIndex];
	}

	/** Wrapper around the search toggle — the focus target after `Escape`. */
	let searchToggleEl = $state<HTMLElement | null>(null);

	/**
	 * Close the search row and hand focus back to the toggle that opened it.
	 *
	 * The toggle stays mounted while search is open, so returning focus is a
	 * single element lookup — no focus-loss when the input unmounts.
	 */
	function closeSearch(restoreFocus = true) {
		searchShow = false;
		if (restoreFocus) searchToggleEl?.querySelector('button')?.focus();
	}

	function handleSearchKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			closeSearch();
			return;
		}
		if (event.key === 'Enter') closeSearch();
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

	// Toolbar control chrome — matches the entry-list action buttons (subtle surface
	// fill + border) so the ghost icons stay legible on light backgrounds instead of
	// melting into the page.
	const btnChrome =
		'h-10 w-10 p-0 flex items-center justify-center rounded-(--admin-radius-input) border border-(--admin-border-default) bg-(--admin-bg-card)/80 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-700 transition-colors';
	const btnChromeActive =
		'h-10 w-10 p-0 flex items-center justify-center rounded-(--admin-radius-input) border border-primary-500/60 bg-primary-500/10 text-primary-500 dark:border-primary-500/50 dark:bg-primary-500/20 dark:text-primary-400 transition-colors';
</script>

<!-- Searching field. It renders ALONGSIDE the toolbar: the previous `{#if searchShow} … {:else} … {/if}`
     branch unmounted the filter/column/density buttons the moment search opened, so the user lost
     every other control (and the toggle that could close search again) while typing. -->
{#if searchShow}
	<div
		class="grid grid-cols-[1fr_auto] h-10 w-full max-w-xs sm:max-w-sm transition-all duration-300 z-50"
	>
		<FloatingInput
			autofocus={searchShow}
			bind:value={globalSearchValue}
			label={table_search_placeholder()}
			icon="material-symbols:search-rounded"
			aria-label={table_search_aria()}
			onkeydown={handleSearchKeydown}
			inputClass="h-full border-none bg-transparent dark:text-surface-50 dark:bg-surface-800"
		/>
		<Button
			variant="ghost"
			onclick={() => {
				globalSearchValue = '';
				closeSearch();
			}}
			onkeydown={(event: KeyboardEvent) => {
				if (event.key === 'Enter' || event.key === ' ') {
					globalSearchValue = '';
					closeSearch();
				}
			}}
			aria-label={table_clear_search()}
			class="w-10 flex items-center justify-center"
		>
			<iconify-icon icon="ic:outline-search-off" width={24}></iconify-icon>
		</Button>
	</div>
{/if}

<span class="contents" bind:this={searchToggleEl}>
	<SystemTooltip title={table_search_toggle()}>
		<Button
			variant="ghost"
			type="button"
			onclick={() => {
				searchShow = !searchShow;
				if (searchShow) closeOpenStates('search');
			}}
			aria-label={table_search_toggle()}
			aria-expanded={searchShow}
			class={searchShow ? btnChromeActive : btnChrome}
		>
			<iconify-icon icon="material-symbols:search-rounded" width={24}></iconify-icon>
		</Button>
	</SystemTooltip>
</span>

<!-- Filter -->
<SystemTooltip title={table_filter_toggle()}>
	<Button
		variant="ghost"
		type="button"
		onclick={() => {
			filterShow = !filterShow;
			if (filterShow) closeOpenStates('filter');
		}}
		aria-label={table_filter_toggle()}
		class={filterShow ? btnChromeActive : btnChrome}
	>
		<iconify-icon icon="carbon:filter-edit" width={24}></iconify-icon>
	</Button>
</SystemTooltip>

<!-- Column Order & Visibility -->
<SystemTooltip title={table_column_toggle()}>
	<Button
		variant="ghost"
		type="button"
		onclick={() => {
			columnShow = !columnShow;
			if (columnShow) closeOpenStates('column');
		}}
		aria-label={table_column_toggle()}
		class={columnShow ? btnChromeActive : btnChrome}
	>
		<iconify-icon icon="fluent:column-triple-edit-24-regular" width={24}></iconify-icon>
	</Button>
</SystemTooltip>

<!-- Spacing/Density -->
<SystemTooltip title={table_density_label({ density: getDensityDisplayName() })}>
	<Button
		variant="ghost"
		type="button"
		onclick={() => {
			cycleDensity();
			closeOpenStates('density');
		}}
		aria-label={table_density_toggle()}
		class={btnChrome}
	>
		<iconify-icon icon={getDensityIcon()} width={24}></iconify-icon>
	</Button>
</SystemTooltip>

<!-- View Mode (Table / Card) — reports through `onViewModeChange` only: the
     controller owns `viewMode` (it persists the pref), so a local write plus a
     callback wrote it twice, and a `bind:` against a getter-only accessor threw. -->
{#if showViewMode}
	<SystemTooltip
		title={viewMode === 'table' ? table_switch_to_card_view() : table_switch_to_table_view()}
	>
		<Button
			variant="ghost"
			type="button"
			onclick={() => onViewModeChange?.(viewMode === 'table' ? 'card' : 'table')}
			aria-label={viewMode === 'table' ? table_switch_to_card_view() : table_switch_to_table_view()}
			class={btnChrome}
		>
			<iconify-icon
				icon={viewMode === 'table'
					? 'material-symbols:grid-view-rounded'
					: 'material-symbols:table-rows-rounded'}
				width={24}
			></iconify-icon>
		</Button>
	</SystemTooltip>
{/if}
