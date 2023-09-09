<script lang="ts">
	import { categories, collection } from '@src/collections/index';

	import {
		mode,
		entryData,
		deleteEntry,
		handleSidebarToggle,
		toggleLeftSidebar,
		storeListboxValue
	} from '@src/stores/store';
	import { contentLanguage } from '@src/stores/store';
	import axios from 'axios';

	// TanstackFilter
	import TanstackFilter from '@src/components/TanstackFilter.svelte';
	let globalSearchValue = '';
	let searchShow = false;
	let filterShow = false;
	let columnShow = false;
	let density = 'normal';

	// TanstackTable
	import TanstackTable from '@src/components/TanstackTable.svelte';

	import EntryListMultiButton from './EntryList_MultiButton.svelte';
	import TranslationStatus from './TranslationStatus.svelte';

	let data: any = [];
	let tableData: any = [];

	// This function refreshes the data displayed in a table by fetching new data from an API endpoint and updating the tableData and options variables.
	let refresh = async (collection: typeof $collection) => {
		//console.log($collection);

		if ($collection.name == '') return;

		data = undefined;
		data = (await axios
			.get(`/api/${$collection.name}?page=${1}&length=${50}`)
			.then((data) => data.data)) as { entryList: [any]; totalCount: number };

		//console.log(data);

		tableData = await Promise.all(
			data.entryList.map(async (entry) => {
				let obj: { [key: string]: any } = {};
				for (let field of collection.fields) {
					obj[field.label] = await field.display?.({
						data: entry[field.label],
						collection: $collection.name,
						field,
						entry,
						contentLanguage: $contentLanguage
					});
				}
				obj._id = entry._id;
				return obj;
			})
		);

		//console.log(tableData);
	};
</script>

<!-- Header -->
<div class="mb-2 flex justify-between dark:text-white">
	<!-- Row 1 for Mobile -->
	<div class="flex items-center justify-between">
		<!-- Hamburger -->
		{#if $toggleLeftSidebar === 'closed'}
			<button
				type="button"
				on:keydown
				on:click={() => {
					// console.log('Hamburger clicked');
					toggleLeftSidebar.click();
				}}
				class="variant-ghost-surface btn-icon mt-1"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24" />
			</button>
		{/if}
		<!-- Collection type with icon -->
		<!-- TODO: Translate Collection Name -->
		<div class="mr-1 flex flex-col {!$toggleLeftSidebar ? 'ml-2' : 'ml-1 sm:ml-2'}">
			{#if categories.length}<div
					class="mb-2 text-xs capitalize text-surface-500 dark:text-surface-300"
				>
					{categories[0].name}
				</div>{/if}
			<div
				class="-mt-2 flex justify-start text-sm font-bold uppercase dark:text-white md:text-2xl lg:text-xl"
			>
				{#if $collection.icon}<span>
						<iconify-icon
							icon={$collection.icon}
							width="24"
							class="mr-1 text-error-500 sm:mr-2"
						/></span
					>{/if}
				{#if $collection.name}
					<div
						class="flex max-w-[65px] whitespace-normal leading-3 sm:mr-2 sm:max-w-none md:mt-0 md:leading-none xs:mt-1"
					>
						{$collection.name}
					</div>
				{/if}
			</div>
		</div>
	</div>

	<button
		type="button"
		on:keydown
		on:click={() => (searchShow = !searchShow)}
		class="variant-ghost-surface btn-icon sm:hidden"
	>
		<iconify-icon icon="material-symbols:filter-list-rounded" width="30" />
	</button>

	<div class="relative hidden items-center justify-center gap-2 sm:flex">
		<TanstackFilter
			bind:globalSearchValue
			bind:searchShow
			bind:filterShow
			bind:columnShow
			bind:density
		/>
		<TranslationStatus />
	</div>

	<!-- MultiButton -->
	<EntryListMultiButton />
</div>

tanstack should show
{#if tableData.length > 0}
	<TanstackTable
		data={tableData}
		items={data}
		{tableData}
		dataSourceName="EntryList"
		bind:globalSearchValue
		bind:filterShow
		bind:columnShow
		bind:density
	/>
{/if}
