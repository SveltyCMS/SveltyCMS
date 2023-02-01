<script lang="ts">
	import axios from 'axios';
	import env from '@root/env';
	import { entryData, language } from '@src/stores/store';

	import { onMount } from 'svelte';
	import DeleteIcon from './icons/DeleteIcon.svelte';
	import { never } from '@src/utils/utils_svelte';
	import ToolTip from '@src/components/ToolTip.svelte';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';

	// Skeleton
	import { menu } from '@skeletonlabs/skeleton';
	import { Modal, modalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';
	import { InputChip } from '@skeletonlabs/skeleton';

	let defaultDisplay = ['ID', 'Status', 'Label', 'User', 'Email'];

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	export let showFields = false;
	export let collection: any = undefined;
	export let deleteMode = false;
	export let category = 'Some';

	// define default button
	let entryButton = 'create';
	let entryList: any = [];
	let totalPages = 0;
	let deleteMap: any = {};
	let deleteAll = false;
	let tmp_entry: any;
	let showsearch = false;

	$: process_deleteAll(deleteAll);
	$: deleteMode = Object.values(deleteMap).includes(true);
	let refresh_deleteMap = (_: any) => {
		deleteMap = {};
	};

	$: refresh_deleteMap(collection);
	export let refresh: (collection: any) => Promise<any>;
	onMount(() => {
		refresh = async (collection: any) => {
			entryList = [];
			({ entryList, totalCount: paging.totalCount } = await axios
				.get(
					`${env.HOST}:${env.PORT}/api/${collection.name}?page=${paging.page}&length=${paging.entryLength}`
				)
				.then((data) => data.data));
			totalPages = Math.ceil(paging.totalCount / paging.entryLength);
			deleteMap = {};
		};
	});
	$: refresh && refresh(collection);

	async function deleteEntry() {
		const confirm: ModalSettings = {
			type: 'confirm',
			title: $LL.ENTRYLIST_Delete_title(),
			body: $LL.ENTRYLIST_Delete_body(),

			// TRUE if confirm pressed, FALSE if cancel pressed
			response: async (r: boolean) => {
				if (r) {
					let deleteList: Array<string> = [];
					for (let item in deleteMap) {
						deleteMap[item] && deleteList.push(entryList[item]._id);
					}
					if (deleteList.length == 0) return;
					let formData = new FormData();
					formData.append('ids', JSON.stringify(deleteList));
					await axios.delete(`${env.HOST}:${env.PORT}/api/${collection.name}`, { data: formData });
					refresh(collection);
				}
			},
			// Optionally override the button text
			buttonTextCancel: $LL.ENTRYLIST_Delete_cancel(),
			buttonTextConfirm: $LL.ENTRYLIST_Delete_confirm()
		};
		modalStore.trigger(confirm);

		deleteAll = false;
	}

	let filter: any = '';
	let filtered_entryList = [...entryList];
	$: {
		filtered_entryList = entryList.filter((item: object) => {
			return filter ? Object.values(item).some((x) => x.toString().includes(filter)) : true;
		});
		// string == relationship id which does not need to be translatable object

		filter;
	}

	function triggerConfirm(): void {
		const confirm: ModalSettings = {
			type: 'confirm',
			title: '{$LL.ENTRYLIST_Delete_confirm_title()}',
			body: '{$LL.ENTRYLIST_Delete_confirm_body()}',
			// TRUE if confirm pressed, FALSE if cancel pressed
			response: (r: boolean) => console.log('response:', r),
			// Optionally override the button text
			buttonTextCancel: '{$LL.ENTRYLIST_Delete_confirm_cancel()}',
			buttonTextConfirm: '{$LL.ENTRYLIST_Delete_confirm_confirm()}'
		};
		modalStore.trigger(confirm);
	}

	//$: console.log(filtered_entryList);
	function process_deleteAll(deleteAll: boolean) {
		triggerConfirm = true;
		if (deleteAll) {
			for (let item in entryList) {
				deleteMap[item] = true;
			}
		} else {
			for (let item in deleteMap) {
				deleteMap[item] = false;
			}
		}
	}

	// Publish selected Content
	export async function publishEntry() {
		alert('publish added soon');
	}

	// Unpublish selected Content
	export async function unpublishEntry() {
		alert('unpublish added soon');
	}

	// Schedule selected Content to be published/unpublished
	export async function scheduleEntry() {
		alert('schedule added soon');
	}

	// Clone selected Content
	export async function cloneEntry() {
		alert('clone added soon');
	}

	export let toggleSideBar = false;
	import { flattenData } from '@src/utils/utils';

	// Is not really stored on page reload
	function changeItemsPerPage(newValue: number) {
		paging.entryLength = newValue;
		// refresh itemsPerPage??
		refresh(collection);
	}

	// Define initial Pagination & ItemsPerPage
	let paging = { page: 1, entryLength: 10, totalCount: 0, lengthList: [10, 25, 50, 100, 500] };

	// sort and filter
	let sort = false;
	let order = false; // false = down / true = up

	// Language filter incorrect
	function search(e: Event) {
		filter = (e.target as HTMLInputElement).value;
	}
</script>

<Modal />
<div class="relative -mt-[65px] md:mt-0">
	<div class="mb-2 flex items-center gap-2">
		<!-- hamburger -->
		<div class="flex items-center">
			<button
				class="btn btn-sm -mr-2 sm:mr-0 md:hidden"
				on:click={() => (toggleSideBar = !toggleSideBar)}
			>
				<span>
					<svg viewBox="0 0 100 80" class="h-4 w-4 fill-token">
						<rect width="100" height="20" />
						<rect y="30" width="100" height="20" />
						<rect y="60" width="100" height="20" />
					</svg>
				</span>
			</button>
		</div>

		<div class="flex flex-col">
			{#if category}<div class="mb-2 text-xs capitalize text-surface-500 dark:text-surface-300">
					{category}
				</div>{/if}
			<div
				class="-mt-2 flex justify-start text-sm font-bold uppercase dark:text-white md:text-xl xl:text-2xl "
			>
				{#if collection.icon}<span>
						<Icon icon={collection.icon} width="24" class="mr-1 sm:mr-2" /></span
					>{/if}
				{#if collection.name}
					<div class="flex break-words leading-3 sm:mr-2 md:leading-none">
						{collection.name}
					</div>
				{/if}
			</div>
		</div>

		<!-- Mobile Search box -->
		<div class="mx-auto max-w-md md:hidden ">
			{#if !showsearch}
				<button
					on:click={() => (showsearch = !showsearch)}
					class="btn-icon relative mt-1 bg-surface-600 "
				>
					<Icon
						icon="material-symbols:search-rounded"
						width="24"
						class="absolute text-center "
					/></button
				>{/if}

			{#if showsearch}
				<div
					class="input-group input-group-divider absolute top-0 left-0 z-30 h-14 grid-cols-[auto_1fr_auto] rounded-none border-b-2 !border-b-white"
				>
					<Icon icon="material-symbols:search-rounded" width="24" class="mx-2 mt-4" />
					<input
						on:keyup={(event) => {
							if (event.keyCode === 13) {
								search();
								showsearch = false;
							}
						}}
						on:blur={() => (showsearch = false)}
						type="search"
						placeholder="{$LL.ENTRYLIST_Search()} {collection.name} ..."
					/>

					<button
						on:click={() => {
							search();
							showsearch = false;
						}}
						class="btn variant-filled-primary h-full rounded-l-none rounded-b-none">Search</button
					>
				</div>
			{/if}
		</div>

		<!-- Desktop Search -->
		<div class="relative mx-auto hidden w-max md:block">
			<input
				on:keyup={search}
				placeholder="{$LL.ENTRYLIST_Search()} {collection.name} ..."
				class="relative z-10 mt-1 h-10 !w-10 cursor-pointer !rounded-full border border-surface-500 bg-surface-200/50 pl-12 text-black shadow-xl outline-none focus:!w-full focus:cursor-text focus:rounded-md dark:bg-surface-500/50 dark:text-white md:mt-0 md:h-12 md:!w-full "
			/>
			<!-- searchIcon -->
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="absolute inset-y-0 my-auto h-8 w-12 border-transparent stroke-black px-3.5 dark:stroke-white "
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				stroke-width="2"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
				/>
			</svg>
		</div>

		<!-- language switcher for entryList -->
		<span class="relative rounded-md shadow-xl">
			<button
				use:menu={{ menu: 'ContentLang' }}
				class="btn flex items-center justify-center rounded-md border-surface-400 bg-surface-600 px-2 pt-2 pr-0 uppercase text-white "
			>
				<Icon icon="bi:translate" color="dark" width="22" class="-mr-2 md:mr-1" />
				<span class="hidden sm:block">{$language}</span>
				<Icon icon="mdi:chevron-down" width="24" />
			</button>
			<nav
				class="card list-nav w-[95px] border bg-surface-600 p-2 text-center text-white shadow-xl transition duration-150 ease-in-out hover:bg-surface-500 focus:bg-surface-700 focus:outline-none focus:ring-0 active:bg-surface-600 dark:bg-surface-400 dark:text-black"
				data-menu="ContentLang"
			>
				<ul class="divide-y">
					{#each Object.keys(env.translations).filter((data) => $language != data) as _language}
						<li
							on:click={() => {
								$language = _language;
								open = false;
							}}
						>
							{env.translations[_language]}
						</li>
					{/each}
				</ul>
			</nav>
		</span>

		<!-- create/publish/unpublish/schedule/clone/delete -->
		<div class="flex items-center justify-center">
			<!-- the actual buttons -->
			<div
				class="inline-flex rounded-l-full rounded-r shadow-md hover:shadow-lg focus:shadow-lg"
				role="group"
			>
				{#if entryButton == 'create' && !deleteMode}
					<button
						on:click={() => {
							showFields = true;
						}}
						class="relative flex w-[60px] items-center justify-center rounded-l-full border-r-2 border-white bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400 px-2 py-2 text-xl font-bold text-black md:ml-auto md:w-[150px]"
					>
						<ToolTip
							text="{$LL.ENTRYLIST_Create()} {collection.name}"
							position="bottom"
							class="bg-surface-500 text-black dark:text-white"
						/>
						<Icon icon="ic:round-plus" color="black" width="22" class="mr-1" />
						<div class="hidden md:block">{$LL.ENTRYLIST_Create()}</div>
					</button>
				{:else if entryButton == 'publish'}
					<button
						class="flex w-[60px] items-center justify-center rounded-l-full border-r-2 border-white bg-gradient-to-br from-tertiary-700 via-tertiary-600 to-tertiary-500 px-2 py-2 text-xl font-bold text-white md:ml-auto md:w-[150px]"
						on:click={() => {
							publishEntry();
						}}
					>
						<ToolTip
							text="{$LL.ENTRYLIST_Publish()} {collection.name}"
							position="bottom"
							class="bg-surface-500 text-black dark:text-white"
						/>
						<Icon icon="bi:hand-thumbs-up-fill" color="white" width="22" class="mr-1" />
						<div class="hidden md:block">{$LL.ENTRYLIST_Publish()}</div>
					</button>
				{:else if entryButton == 'unpublish'}
					<button
						class="relative flex w-[60px] items-center justify-center rounded-l-full border-r-2 border-white bg-gradient-to-br from-warning-600 via-warning-500 to-warning-300 px-2 py-2 text-xl font-bold text-white md:ml-auto md:w-[150px]"
						on:click={() => {
							unpublishEntry();
						}}
						><ToolTip
							text="{$LL.ENTRYLIST_Unpublish()} {collection.name}"
							position="bottom"
							class="bg-surface-500 text-black dark:text-white"
						/>
						<Icon icon="bi:pause-circle" color="white" width="22" class="mr-1" />
						<div class="hidden md:block">{$LL.ENTRYLIST_Unpublish()}</div>
					</button>
				{:else if entryButton == 'schedule'}
					<button
						class="relative flex w-[60px] items-center justify-center rounded-l-full border-r-2 border-white bg-gradient-to-br from-pink-700 via-pink-500 to-pink-300 px-2 py-2 text-xl font-bold text-white md:ml-auto md:w-[150px]"
						on:click={() => {
							scheduleEntry();
						}}
						><ToolTip
							text="{$LL.ENTRYLIST_Schedule()} {collection.name}"
							position="bottom"
							class="bg-surface-500 text-black dark:text-white"
						/>
						<Icon icon="bi:clock" color="white" width="22" class="mr-1" />
						<div class="hidden md:block">{$LL.ENTRYLIST_Schedule()}</div>
					</button>
				{:else if entryButton == 'clone'}
					<button
						class="relative flex w-[60px] items-center justify-center rounded-l-full border-r-2 border-white bg-gradient-to-br from-surface-500 via-surface-400 to-surface-300 px-2 py-2 text-xl font-bold text-white md:ml-auto md:w-[150px]"
						on:click={() => {
							cloneEntry();
						}}
						><ToolTip
							text="{$LL.ENTRYLIST_Clone()} {collection.name}"
							position="bottom"
							class="bg-surface-500 text-black dark:text-white"
						/>
						<Icon icon="bi:clipboard-data-fill" color="white" width="22" class="mr-1" />
						<div class="hidden md:block">{$LL.ENTRYLIST_Clone()}</div>
					</button>
				{:else if entryButton == 'delete' || deleteMode}
					<button
						class="relative flex w-[60px] items-center justify-center rounded-l-full border-r-2 border-white bg-gradient-to-br from-error-600 via-error-500 to-error-300 px-2 py-2 text-xl font-bold text-white md:ml-auto md:w-[150px]"
						on:click={() => {
							deleteEntry();
						}}
						><ToolTip
							text="{$LL.ENTRYLIST_Delete()} {collection.name}"
							position="bottom"
							class="bg-surface-500 text-black dark:text-white"
						/>
						<Icon icon="bi:trash3-fill" color="white" width="22" class="mr-1" />
						<div class="hidden md:block">{$LL.ENTRYLIST_Delete()}</div>
					</button>
				{/if}

				<!-- Dropdown selection -->
				<button
					use:menu={{ menu: 'entrySelect', interactive: true }}
					class="relative mr-1 inline-block rounded-l-none rounded-r bg-surface-600 px-2 text-xs font-medium uppercase leading-tight text-white transition duration-150 ease-in-out hover:bg-surface-700 focus:bg-surface-700 focus:outline-none focus:ring-0 active:bg-surface-700"
				>
					<Icon icon="mdi:chevron-down" width="24" /></button
				>

				<nav
					class="card list-nav mt-14 mr-1 w-52 bg-surface-600 p-2 shadow-xl dark:border-none dark:bg-surface-300"
					data-menu="entrySelect"
				>
					<ul>
						{#if entryButton != 'create'}
							<li>
								<button
									on:click={() => {
										entryButton = 'create';
									}}
									class="btn btn-base w-full bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400 font-bold text-white"
								>
									<span><Icon icon="ic:round-plus" width="22" /></span>
									<span class="text-xl font-bold">{$LL.ENTRYLIST_Create()}</span>
								</button>
							</li>{/if}
						{#if entryButton != 'publish'}
							<li>
								<button
									on:click={() => {
										entryButton = 'publish';
									}}
									class="btn btn-base w-full bg-gradient-to-br from-tertiary-700 via-tertiary-600 to-tertiary-500 font-bold text-white"
								>
									<span><Icon icon="bi:hand-thumbs-up-fill" width="20" /></span>
									<span class="text-xl font-bold">{$LL.ENTRYLIST_Publish()}</span>
								</button>
							</li>
						{/if}
						{#if entryButton != 'unpublish'}
							<li>
								<button
									on:click={() => {
										entryButton = 'unpublish';
									}}
									class="btn btn-base w-full bg-gradient-to-br from-warning-600 via-warning-500 to-warning-300 font-bold text-white "
								>
									<span><Icon icon="bi:pause-circle" width="20" /></span>
									<span class="text-xl font-bold">{$LL.ENTRYLIST_Unpublish()}</span>
								</button>
							</li>
						{/if}
						{#if entryButton != 'schedule'}
							<li>
								<button
									on:click={() => {
										entryButton = 'schedule';
									}}
									class="btn btn-base w-full bg-gradient-to-br from-pink-700 via-pink-500 to-pink-300 font-bold text-white "
								>
									<span><Icon icon="bi:clock" width="20" /></span>
									<span class="text-xl font-bold">{$LL.ENTRYLIST_Schedule()}</span>
								</button>
							</li>
						{/if}
						{#if entryButton != 'clone'}
							<li>
								<button
									on:click={() => {
										entryButton = 'clone';
									}}
									class="btn btn-base w-full bg-gradient-to-br from-surface-500 via-surface-400 to-surface-300 font-bold text-white "
								>
									<span><Icon icon="bi:clipboard-data-fill" width="20" /></span>
									<span class="text-xl font-bold">{$LL.ENTRYLIST_Clone()}</span>
								</button>
							</li>
						{/if}
						{#if entryButton != 'delete'}
							<li>
								<button
									on:click={() => {
										entryButton = 'delete';
									}}
									class="btn btn-base w-full bg-gradient-to-br from-error-600 via-error-500 to-error-300 text-white"
								>
									<span><Icon icon="bi:trash3-fill" width="20" /></span>
									<span class="text-xl font-bold">{$LL.ENTRYLIST_Delete()}</span>
								</button>
							</li>
						{/if}
					</ul>
				</nav>
			</div>
		</div>
	</div>

	<!-- TODO: Link to Colletion widgetValue -->
	<InputChip placeholder="Add more Columns..." bind:value={defaultDisplay} />
	<!-- Show Collection Table -->
	<!-- TODO: Add Sort/Filter -->
	<div class="table-container max-h-[80vh] overflow-auto bg-white shadow-xl dark:bg-surface-800 ">
		<table class="fixed_header table-hover inline-block ">
			<thead class="sticky top-0 ">
				<tr class="border-b-2 border-black bg-surface-600 dark:border-white dark:bg-surface-500  ">
					<th><DeleteIcon bind:checked={deleteAll} /></th>

					<th class={never('text-white ')}>#</th>

					{#each collection.fields as field}
						<th class={never('text-white ')}>
							<div
								on:click={() => {
									sort = field.name;
									order = !order;
								}}
								class="flex items-center justify-start gap-1"
							>
								{field.db_fieldName}

								<!-- {#if (sort = field.name)} -->
								{#if !sort}
									{#if !order}
										<button>
											<div class="flex-col">
												<Icon icon="bi:caret-up-fill" color="base" width="14" class="" />
												<Icon icon="bi:caret-down-fill" color="black" width="14" class="-mt-1" />
											</div></button
										>
									{:else}
										<button>
											<div class="flex-col ">
												<Icon icon="bi:caret-up-fill" color="black" width="14" class="" />
												<Icon icon="bi:caret-down-fill" color="base" width="14" class="-mt-1" />
											</div></button
										>
									{/if}
								{/if}
							</div></th
						>
					{/each}
				</tr>
			</thead>

			<tbody class="table-row-group">
				{#each filtered_entryList as entry, index}
					<tr
						on:click={() => {
							showFields = true;
							$entryData = entry;
						}}
					>
						<td>
							<DeleteIcon bind:checked={deleteMap[index]} />
						</td>

						<td>{index + 1}</td>
						{#key $language}
							{#each collection.fields as field}
								{((tmp_entry = flattenData(entry, $language)), '')}
								{#await field?.display?.(tmp_entry[field.db_fieldName], field, tmp_entry)}
									<td class="">{$LL.ENTRYLIST_Loading()}</td>
								{:then display}
									{((entry.displays = {}), '')}
									<td class="">{@html (entry.displays[field.db_fieldName] = display)}</td>
								{/await}
							{/each}
						{/key}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>
</div>

<div class="flex items-center justify-between border-surface-200 p-2 ">
	<div class="flex flex-1 items-center justify-between">
		<!-- Pagecounter -->
		<div class="hidden text-sm text-surface-700 dark:text-surface-400 sm:block">
			{$LL.ENTRYLIST_Showing()}
			<span class="font-semibold text-surface-900 dark:text-white"
				>{(paging.page - 1) * paging.entryLength + 1}</span
			>
			{$LL.ENTRYLIST_to()}
			<span class="font-semibold text-surface-900 dark:text-white"
				>{paging.entryLength * paging.page > paging.totalCount
					? paging.totalCount
					: paging.entryLength * paging.page}</span
			>
			{$LL.ENTRYLIST_of()}
			<span class="font-semibold text-surface-900 dark:text-white">{paging.totalCount} </span>
			<!-- TODO Correct Translation for Pluralization -->
			{$LL.ENTRYLIST_Entries()}
		</div>

		<!-- ItemsPerPage -->
		<span class="relative rounded-md">
			<button
				use:menu={{ menu: 'pageItems' }}
				class="btn flex items-center justify-center rounded-md border border-surface-600 px-2 uppercase"
			>
				{paging.entryLength}
				<Icon icon="mdi:chevron-down" width="24" />
			</button>
			<nav
				class="card list-nav w-[100px] cursor-pointer border bg-surface-600 p-2 text-center text-white shadow-xl dark:bg-surface-300 sm:absolute sm:top-0 sm:-left-6"
				data-menu="pageItems"
			>
				<ul class="divide-y">
					{#each paging.lengthList as length}
						<li
							class="-mx-2 transition duration-150 ease-in-out hover:bg-surface-700 focus:bg-surface-700 focus:outline-none focus:ring-0 active:bg-surface-700 dark:text-black hover:dark:text-white"
							value={length}
							on:click={() => changeItemsPerPage(length)}
						>
							{length}
							{$LL.ENTRYLIST_EntriesItems()}
						</li>
					{/each}
				</ul>
			</nav>
		</span>

		<!-- Pagination -->
		<div class="dark:text-white">
			<nav class="isolate inline-flex -space-x-px rounded-md shadow-sm" aria-label="Pagination">
				<!-- Previous -->
				<div
					on:click={() => {
						paging.page > 1 && (paging.page--, refresh(collection));
					}}
					class="relative inline-flex items-center rounded-l-md border border-surface-400 px-2 py-2 text-sm font-medium text-surface-400 hover:bg-surface-50 focus:z-20"
				>
					<span class="sr-only">{$LL.ENTRYLIST_Previous()}</span>
					<Icon icon="mdi:chevron-left" width="24" />
				</div>

				<!-- pages -->
				{#each Array(totalPages) as _, i}
					<div
						on:click={() => {
							paging.page = i + 1;
							refresh(collection);
						}}
						class:active={paging.page == i + 1}
						aria-current="page"
						class="relative inline-flex items-center border border-surface-400 px-4 py-2 text-sm font-medium text-surface-400  hover:bg-surface-400 hover:text-white focus:z-20 active:text-black "
					>
						{i + 1}
					</div>
				{/each}

				<!-- Next -->
				<div
					on:click={() => {
						paging.page < totalPages && (paging.page++, refresh(collection));
					}}
					class="relative inline-flex items-center rounded-r-md border border-surface-400 px-2 py-2 text-sm font-medium text-surface-400 hover:bg-surface-50 focus:z-20"
				>
					<span class="sr-only">{$LL.ENTRYLIST_Next()}</span>
					<Icon icon="mdi:chevron-right" width="24" />
				</div>
			</nav>
		</div>
	</div>
</div>

<style>
	.fixed_header {
		table-layout: fixed;
		border-collapse: collapse;
	}

	.fixed_header tbody {
		display: block;
		width: 100%;
		overflow: auto;
		max-height: 70vh;
	}

	.fixed_header thead tr {
		display: block;
	}

	.fixed_header th,
	.fixed_header td {
		padding: 5px;
		text-align: left;
		width: 220px;
	}
</style>
