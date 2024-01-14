<script lang="ts">
	import { translationStatusOpen } from '@stores/store';

	// Define reactive variables to track the state of each element

	export let globalSearchValue = '';
	export let searchShow = false;
	export let filterShow = false;
	export let columnShow = false;
	export let density = 'normal';

	// Define a function to close any open elements
	function closeOpenStates() {
		searchShow = false;
		filterShow = false;
		columnShow = false;
		translationStatusOpen.set(false);
	}
</script>

<!-- Expanding Search -->
{#if searchShow}
	<div class="input-group input-group-divider grid grid-cols-[auto_1fr_auto]">
		<!-- TODO: fix search -->
		<input
			type="text"
			autofocus
			placeholder="Search..."
			bind:value={globalSearchValue}
			on:keydown={(e) => e.key === 'Enter'}
			on:focus={() => (searchShow = false)}
			class="input outline-none transition-all duration-500 ease-in-out"
		/>
		{#if globalSearchValue}
			<button
				on:click={() => {
					globalSearchValue = '';
				}}
				on:keydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						globalSearchValue = '';
					}
				}}
				class="variant-filled-surface w-12"
				><iconify-icon icon="ic:outline-search-off" width="24" />
			</button>
		{/if}
	</div>
{:else}
	<button
		type="button"
		on:click={() => {
			closeOpenStates();
			searchShow = !searchShow;
		}}
		class="variant-ghost-surface btn-icon"
	>
		<iconify-icon icon="material-symbols:search-rounded" width="24" />
	</button>
{/if}

{#if !searchShow}
	<!-- Filter -->
	<button
		type="button"
		on:click={() => {
			if (filterShow) {
				filterShow = false;
			} else {
				closeOpenStates();
				filterShow = true;
			}
		}}
		class="variant-ghost-surface btn-icon"
	>
		<iconify-icon icon="carbon:filter-edit" width="24" />
	</button>

	<!-- Column Order & Visibility -->
	<!-- Column Order/ Sort-->
	<button
		type="button"
		on:click={() => {
			if (columnShow) {
				columnShow = false;
			} else {
				closeOpenStates();
				columnShow = true;
			}
		}}
		class="variant-ghost-surface btn-icon"
	>
		<iconify-icon icon="fluent:column-triple-edit-24-regular" width="24" />
		<!--  Column  -->
	</button>

	<!-- Spacing/Density  -->
	<button
		type="button"
		on:click={() => {
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
		class="variant-ghost-surface btn-icon"
	>
		<iconify-icon
			icon={density === 'compact'
				? 'material-symbols:align-space-even-rounded'
				: density === 'normal'
					? 'material-symbols:align-space-around-rounded'
					: 'material-symbols:align-space-between-rounded'}
			width="24"
		/>
	</button>
{/if}
