<script lang="ts">
	import axios from 'axios';
	import { PUBLIC_TRANSLATIONS } from '$env/static/public';
	import { entryData, language } from '$src/stores/store';
	import { never } from '$src/lib/utils/utils_svelte';
	import { find, flattenData } from '$src/lib/utils/utils';
	import showFieldsStore from '$src/lib/stores/fieldStore';
	import Form from './Form.svelte';
	import DeleteIcon from './icons/DeleteIcon.svelte';
	import AnimatedHamburger from '$src/components/AnimatedHamburger.svelte';
	import schemas from '$src/collections';

	//export let open = false; // animate hamburger
	export let switchSideBar = false;
	export let showFields = false;
	export let collection: any = undefined;
	export let deleteMode = false;
	export let category = 'Some';
	export let fields: any;

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { Modal, modalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings } from '@skeletonlabs/skeleton';
	import type { Schema } from '$src/collections/types';
	import { onMount } from 'svelte';
	import entryListTableStore from '$src/lib/stores/entryListTable';

	// Popup Tooltips
	let CreateSettings: PopupSettings = {
		event: 'hover',
		target: 'CreatePopup',
		placement: 'bottom'
	};
	let PublishSettings: PopupSettings = {
		event: 'hover',
		target: 'PublishPopup',
		placement: 'bottom'
	};
	let UnpublishSettings: PopupSettings = {
		event: 'hover',
		target: 'UnpublishPopup',
		placement: 'bottom'
	};
	let ScheduleSettings: PopupSettings = {
		event: 'hover',
		target: 'SchedulePopup',
		placement: 'bottom'
	};
	let CloneSettings: PopupSettings = {
		event: 'hover',
		target: 'ClonePopup',
		placement: 'bottom'
	};
	let DeleteSettings: PopupSettings = {
		event: 'hover',
		target: 'DeletePopup',
		placement: 'bottom'
	};

	// Popup Dropdowns
	let ContentLangSettings: PopupSettings = {
		// Set the event as: click | hover | hover-click
		event: 'click',
		// Provide a matching 'data-popup' value.
		target: 'entryListlanguagePopup'
	};

	//TODO: Get Roles from allowed user
	let tableColumns: Record<string, boolean> = {
		ID: true,
		Status: true,
		Label: true,
		Email: true,
		other: false
	};

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
	export let refresh = async (collection: any) => {
		entryList = [];

		({ entryList, totalCount: paging.totalCount } = await axios
			.get(`/api/${collection.name}?page=${paging.page}&length=${paging.entryLength}`)
			.then((data) => data.data));
		totalPages = Math.ceil(paging.totalCount / paging.entryLength);
		deleteMap = {};

		$entryListTableStore = {
			entryList,
			totalPages,
			deleteMap
		};
	};
	$: refresh && refresh(collection);

	$: entryList = $entryListTableStore.entryList;
	$: totalPages = $entryListTableStore.totalPages;
	$: deleteMap = $entryListTableStore.deleteMap;

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
					await axios.delete(`/api/${collection.name}`, { data: formData });
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
		// triggerConfirm = true;
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

	// buttons dropdown popup settings
	const entityButtonsPopup: PopupSettings = {
		event: 'click',
		target: 'entityButton'
	};

	//tanstack Table here
</script>

<Modal />

{#if !$showFieldsStore.showForm}
	<div class="relative md:mt-0">
		<div class="mb-2 flex items-center gap-2 flex-wrap">
			{#if !switchSideBar}
				<AnimatedHamburger />
			{/if}
			<div class="flex flex-col">
				{#if category}<div class="mb-2 text-xs capitalize text-surface-500 dark:text-surface-300">
						{category}
					</div>{/if}
				<div
					class="-mt-2 flex justify-start text-sm font-bold uppercase dark:text-white md:text-xl xl:text-2xl "
				>
					{#if collection.icon}<span>
							<Icon icon={collection.icon} width="24" class="mr-1 sm:mr-2 text-error-500" /></span
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
									// search();
									showsearch = false;
								}
							}}
							on:blur={() => (showsearch = false)}
							type="search"
							placeholder="{$LL.ENTRYLIST_Search()} {collection.name} ..."
						/>

						<button
							on:click={() => {
								// search();
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
					use:popup={ContentLangSettings}
					class="btn flex items-center justify-center rounded-md border-surface-400 bg-surface-600 px-2 pt-2 pr-0 uppercase text-white "
				>
					<Icon icon="bi:translate" color="dark" width="22" class="-mr-2 md:mr-1" />
					<span class="hidden sm:block">{$language}</span>
					<Icon icon="mdi:chevron-down" width="24" />
				</button>
				<nav
					class="card list-nav w-[95px] border bg-surface-600 p-2 text-center text-white shadow-xl transition duration-150 ease-in-out hover:bg-surface-500 focus:bg-surface-700 focus:outline-none focus:ring-0 active:bg-surface-600 dark:bg-surface-400 dark:text-black"
					data-popup="entryListlanguagePopup"
				>
					<ul class="divide-y">
						{#each Object.keys(JSON.parse(PUBLIC_TRANSLATIONS)).filter((data) => $language != data) as _language}
							<li
								on:click={() => {
									$language = _language;
									// open = false;
								}}
							>
								{_language.toUpperCase()}
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
							use:popup={CreateSettings}
							on:click={() => {
								$showFieldsStore.showForm = true;
							}}
							class="relative flex w-[60px] items-center justify-center rounded-l-full border-r-2 border-white bg-gradient-to-br from-primary-600 via-primary-500 to-primary-400 px-2 py-2 text-xl font-bold text-black md:ml-auto md:w-[150px]"
						>
							<!-- Popup Tooltip with the arrow element -->
							<div class="card variant-filled-secondary p-4" data-popup="CreatePopup">
								{$LL.ENTRYLIST_Create()}
								{collection.name}
								<div class="arrow variant-filled-secondary" />
							</div>

							<Icon icon="ic:round-plus" color="black" width="22" class="mr-1" />
							<div class="hidden md:block">{$LL.ENTRYLIST_Create()}</div>
						</button>
					{:else if entryButton == 'publish'}
						<button
							use:popup={PublishSettings}
							class="flex w-[60px] items-center justify-center rounded-l-full border-r-2 border-white bg-gradient-to-br from-tertiary-700 via-tertiary-600 to-tertiary-500 px-2 py-2 text-xl font-bold text-white md:ml-auto md:w-[150px]"
							on:click={() => {
								publishEntry();
							}}
						>
							<!-- Popup Tooltip with the arrow element -->
							<div class="card variant-filled-secondary p-4" data-popup="PublishPopup">
								{$LL.ENTRYLIST_Publish()}
								{collection.name}
								<div class="arrow variant-filled-secondary" />
							</div>

							<Icon icon="bi:hand-thumbs-up-fill" color="white" width="22" class="mr-1" />
							<div class="hidden md:block">{$LL.ENTRYLIST_Publish()}</div>
						</button>
					{:else if entryButton == 'unpublish'}
						<button
							use:popup={UnpublishSettings}
							class="relative flex w-[60px] items-center justify-center rounded-l-full border-r-2 border-white bg-gradient-to-br from-warning-600 via-warning-500 to-warning-300 px-2 py-2 text-xl font-bold text-white md:ml-auto md:w-[150px]"
							on:click={() => {
								unpublishEntry();
							}}
						>
							<!-- Popup Tooltip with the arrow element -->
							<div class="card variant-filled-secondary p-4" data-popup="UnpublishPopup">
								{$LL.ENTRYLIST_Unpublish()}
								{collection.name}
								<div class="arrow variant-filled-secondary" />
							</div>
							<Icon icon="bi:pause-circle" color="white" width="22" class="mr-1" />
							<div class="hidden md:block">{$LL.ENTRYLIST_Unpublish()}</div>
						</button>
					{:else if entryButton == 'schedule'}
						<button
							use:popup={ScheduleSettings}
							class="relative flex w-[60px] items-center justify-center rounded-l-full border-r-2 border-white bg-gradient-to-br from-pink-700 via-pink-500 to-pink-300 px-2 py-2 text-xl font-bold text-white md:ml-auto md:w-[150px]"
							on:click={() => {
								scheduleEntry();
							}}
						>
							<!-- Popup Tooltip with the arrow element -->
							<div class="card variant-filled-secondary p-4" data-popup="SchedulePopup">
								{$LL.ENTRYLIST_Schedule()}
								{collection.name}
								<div class="arrow variant-filled-secondary" />
							</div>
							<Icon icon="bi:clock" color="white" width="22" class="mr-1" />
							<div class="hidden md:block">{$LL.ENTRYLIST_Schedule()}</div>
						</button>
					{:else if entryButton == 'clone'}
						<button
							use:popup={CloneSettings}
							class="relative flex w-[60px] items-center justify-center rounded-l-full border-r-2 border-white bg-gradient-to-br from-surface-500 via-surface-400 to-surface-300 px-2 py-2 text-xl font-bold text-white md:ml-auto md:w-[150px]"
							on:click={() => {
								cloneEntry();
							}}
							><!-- Popup Tooltip with the arrow element -->
							<div class="card variant-filled-secondary p-4" data-popup="SchedulePopup">
								{$LL.ENTRYLIST_Clone()}
								{collection.name}
								<div class="arrow variant-filled-secondary" />
							</div>

							<Icon icon="bi:clipboard-data-fill" color="white" width="22" class="mr-1" />
							<div class="hidden md:block">{$LL.ENTRYLIST_Clone()}</div>
						</button>
					{:else if entryButton == 'delete' || deleteMode}
						<button
							use:popup={DeleteSettings}
							class="relative flex w-[60px] items-center justify-center rounded-l-full border-r-2 border-white bg-gradient-to-br from-error-600 via-error-500 to-error-300 px-2 py-2 text-xl font-bold text-white md:ml-auto md:w-[150px]"
							on:click={() => {
								deleteEntry();
							}}
							><!-- Popup Tooltip with the arrow element -->
							<div class="card variant-filled-secondary p-4" data-popup="SchedulePopup">
								{$LL.ENTRYLIST_Delete()}
								{collection.name}
								<div class="arrow variant-filled-secondary" />
							</div>
							<Icon icon="bi:trash3-fill" color="white" width="22" class="mr-1" />
							<div class="hidden md:block">{$LL.ENTRYLIST_Delete()}</div>
						</button>
					{/if}

					<!-- Dropdown selection 
				use:popup={{ menu: 'entrySelect', interactive: true }}-->
					<button
						use:popup={entityButtonsPopup}
						class="relative mr-1 inline-block rounded-l-none rounded-r bg-surface-600 px-2 text-xs font-medium uppercase leading-tight text-white transition duration-150 ease-in-out hover:bg-surface-700 focus:bg-surface-700 focus:outline-none focus:ring-0 active:bg-surface-700"
					>
						<Icon icon="mdi:chevron-down" width="24" /></button
					>

					<nav
						class="card list-nav mt-1 mr-1 z-10 w-52 bg-surface-600 p-2 shadow-xl dark:border-none dark:bg-surface-300"
						data-popup="entityButton"
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
		<div class="mb-2 flex flex-wrap gap-2 space-x-2">
			{#each Object.keys(tableColumns) as r}
				<span
					class="chip {tableColumns[r] ? 'variant-filled-tertiary' : 'variant-ghost-secondary'}"
					on:click={() => {
						filter(r);
					}}
					on:keypress
				>
					{#if tableColumns[r]}<span><Icon icon="fa:check" /></span>{/if}
					<span class="capitalize">{r}</span>
				</span>
			{/each}
		</div>
		<!-- Show Collection Table -->
		<!-- TODO: Add Sort/Filter -->
		<div class="table-container max-h-[80vh] overflow-auto bg-white shadow-xl dark:bg-surface-800 ">
			<table class="fixed_header table-hover inline-block ">
				<thead class="sticky top-0 ">
					<tr
						class="border-b-2 border-black bg-surface-600 dark:border-white dark:bg-surface-500  "
					>
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
								$showFieldsStore.showForm = true;
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
									{#await field?.display?.(tmp_entry[field?.db_fieldName], field, tmp_entry)}
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
{/if}

{#if $showFieldsStore.showForm}
	<Form {fields} {collection} bind:showFields={$showFieldsStore.showField} />
{/if}

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
