<script>
	import { translationStatusOpen } from '@src/stores/store';

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
	<div class="variant-ghost-surface btn-group relative flex items-center justify-end">
		<!-- TODO: Improve input put css to match btn-group -->
		<input
			type="text"
			placeholder="Search..."
			class="varient-ghost-surface input h-12 w-64 outline-none transition-all duration-500 ease-in-out"
			bind:value={globalSearchValue}
			on:blur={() => (searchShow = false)}
			on:keydown={(e) => e.key === 'Enter' && (searchShow = false)}
		/>
		<!-- TODO: leave input and blur  will not clear results  -->
		<button
			type="button"
			on:click={() => {
				closeOpenStates();
				globalSearchValue = '';
				searchShow = !searchShow;
			}}
			class="w-12 border-r border-surface-500"
		>
			<iconify-icon
				icon="ic:outline-search-off"
				width="24"
				tabindex="0"
				role="button"
				on:click={() => {
					closeOpenStates();
					globalSearchValue = '';
				}}
				on:keydown={(event) => {
					if (event.key === 'Enter' || event.key === ' ') {
						closeOpenStates();
						globalSearchValue = '';
					}
				}}
			/>
		</button>
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
		<!-- {$LL.TANSTACK_Column()} -->
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
