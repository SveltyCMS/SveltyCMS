<!-- 
@file src/components/system/table/TableFilter.svelte
@component
**Table Filter component for displaying search, filter, and column controls.**

```tsx
<TableFilter  bind:globalSearchValue bind:searchShow bind:filterShow bind:columnShow bind:density />
```

#### Props
- `globalSearchValue` {string}: The current value of the global search input (default: '')
- `searchShow` {boolean}: Whether the search input is visible (default: false)
- `filterShow` {boolean}: Whether the filter controls are visible (default: false)
- `columnShow` {boolean}: Whether the column controls are visible (default: false)
- `density` {string}: The density of the table (default: 'normal')
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
	<div class="input-group input-group-divider grid grid-cols-[auto_1fr_auto]">
		<!-- TODO: fix global search -->
		<input
			type="text"
			placeholder="Search..."
			aria-label="Search for items in the table"
			bind:value={globalSearchValue}
			onkeydown={(e) => e.key === 'Enter'}
			class="input outline-none transition-all duration-500 ease-in-out"
		/>
		{#if searchShow}
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
				class="variant-filled-surface w-12"
				><iconify-icon icon="ic:outline-search-off" width="24"></iconify-icon>
			</button>
		{/if}
	</div>
{:else}
	<button
		type="button"
		onclick={() => {
			closeOpenStates();
			searchShow = !searchShow;
		}}
		aria-label="Search"
		class="variant-ghost-surface btn-icon"
	>
		<iconify-icon icon="material-symbols:search-rounded" width="24"></iconify-icon>
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
		class="variant-ghost-surface btn-icon"
	>
		<iconify-icon icon="carbon:filter-edit" width="24"></iconify-icon>
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
		class="variant-ghost-surface btn-icon"
	>
		<iconify-icon icon="fluent:column-triple-edit-24-regular" width="24"></iconify-icon>
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
		class="variant-ghost-surface btn-icon"
	>
		<iconify-icon
			icon={density === 'compact'
				? 'material-symbols:align-space-even-rounded'
				: density === 'normal'
					? 'material-symbols:align-space-around-rounded'
					: 'material-symbols:align-space-between-rounded'}
			width="24"
		></iconify-icon>
	</button>
{/if}
