<!-- 
@file src/components/system/table/TableFilter.svelte
@component
**Optimized table filter component for search, filter, and column controls in a CMS.**

This component provides a lightweight, flexible interface for table filtering, using Svelte 5 runes for reactivity and bindable props for two-way data flow. It includes search, filter toggles, column visibility, and density controls, optimized for performance and reusaqbility.

@example
<TableFilter  bind:globalSearchValue bind:searchShow bind:filterShow bind:columnShow bind:density />

#### Props
- `globalSearchValue` {string}: Current value of the global search input (default: '')
- `searchShow` {boolean}: Visibility of the search input (default: false)
- `filterShow` {boolean}: Visibility of filter controls (default: false)
- `columnShow` {boolean}: Visibility of column controls (default: false)
- `density` {string}: Table density ('compact', 'normal', 'comfortable') (default: 'normal')
- `densityOptions` {string[]}: Custom density options (default: ['compact', 'normal', 'comfortable'])
-->

<script lang="ts">
	// Stores
	import { translationStatusOpen } from '@stores/store.svelte';

	// Props with types
	let {
		globalSearchValue = $bindable(''),
		searchShow = $bindable(false),
		filterShow = $bindable(false),
		columnShow = $bindable(false),
		density = $bindable('normal')
	} = $props<{
		globalSearchValue?: string;
		searchShow?: boolean;
		filterShow?: boolean;
		columnShow?: boolean;
		density?: string;
		densityOptions?: string[];
	}>();

	// Store user settings
	$effect(() => {
		if (density) {
			localStorage.setItem(
				'userPaginationSettings',
				JSON.stringify({
					density
				})
			);
		}
	});

	// Define a function to close any open elements
	function closeOpenStates() {
		searchShow = false;
		filterShow = false;
		columnShow = false;
		$translationStatusOpen = false;
	}
</script>

<!-- Expanding Search -->
{#if searchShow}
	<div class="relative w-full">
		<input
			type="text"
			placeholder="Search ..."
			aria-label="Search for items in the table"
			bind:value={globalSearchValue}
			onkeydown={(e) => e.key === 'Enter' && closeOpenStates()}
			class="input h-[42px] w-full rounded pr-12 transition-all duration-500 ease-in-out"
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
			aria-label="Clear"
			class=" btn preset-filled-surface-500 absolute top-0 right-0 h-[42px] w-[42px] rounded-l-none px-3"
		>
			<iconify-icon icon="ic:outline-search-off" class="text-white" width="32"></iconify-icon>
		</button>
	</div>
{:else}
	<button
		onclick={() => {
			closeOpenStates();
			searchShow = !searchShow;
		}}
		aria-label="Search"
		class="btn preset-outlined border-surface-500 h-[42px] w-[42px] border"
	>
		<iconify-icon icon="material-symbols:search-rounded" width="32"></iconify-icon>
	</button>
{/if}

{#if !searchShow}
	<!-- Filter -->
	<button
		type="button"
		onclick={() => {
			if (filterShow) {
				filterShow = false;
			} else {
				closeOpenStates();
				filterShow = true;
			}
		}}
		aria-label="Filter"
		class="btn preset-outlined border-surface-500 h-[42px] w-[42px] border"
	>
		<iconify-icon icon="carbon:filter-edit" width="32"></iconify-icon>
	</button>

	<!-- Column Order & Visibility -->
	<button
		type="button"
		onclick={() => {
			if (columnShow) {
				columnShow = false;
			} else {
				closeOpenStates();
				columnShow = true;
			}
		}}
		aria-label="Column"
		class="btn preset-outlined border-surface-500 h-[42px] w-[42px] border"
	>
		<iconify-icon icon="fluent:column-triple-edit-24-regular" width="32"></iconify-icon>
	</button>

	<!-- Spacing/Density  -->
	<button
		type="button"
		onclick={() => {
			closeOpenStates();
			// Update the density variable
			if (density === 'compact') {
				density = 'normal';
			} else if (density === 'normal') {
				density = 'comfortable';
			} else {
				density = 'compact';
			}
		}}
		aria-label="Density"
		class="btn preset-outlined border-surface-500 h-[42px] w-[42px] border"
	>
		<iconify-icon
			icon={density === 'compact'
				? 'material-symbols:align-space-even-rounded'
				: density === 'normal'
					? 'material-symbols:align-space-around-rounded'
					: 'material-symbols:align-space-between-rounded'}
			width="32"
		></iconify-icon>
	</button>
{/if}
