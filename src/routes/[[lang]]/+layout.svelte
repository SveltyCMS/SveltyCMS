<script lang="ts">
	// Sveltekit
	import { fly } from 'svelte/transition';
	import { is_dark, entryData } from '$src/stores/store';
	import { enhance } from '$app/forms';

	import { PUBLIC_SITENAME } from '$env/static/public';
	import SimpleCmsLogo from '$src/components/icons/SimpleCMS_Logo.svelte';
	import AnimatedHamburger from '$src/components/AnimatedHamburger.svelte';
	import showFieldsStore from '$src/lib/stores/fieldStore';
	import CollectionsLatest from '$src/components/Collections_latest.svelte';
	import collections, { categories } from '$src/collections';
	// import Collections from '$src/components/Collections.svelte';
	// import EntryList from '$src/components/EntryList.svelte';
	// import Form from '$src/components/Form.svelte';
	import { saveFormData } from '$src/lib/utils/utils_svelte';

	export let switchSideBar = false;

	// Skeleton
	import {
		AppBar,
		AppShell,
		Avatar,
		Modal,
		ProgressBar,
		Toast,
		toastStore
	} from '@skeletonlabs/skeleton';
	import type { ToastSettings } from '@skeletonlabs/skeleton';
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { storePopup } from '@skeletonlabs/skeleton';
	import { computePosition, autoUpdate, flip, shift, offset, arrow } from '@floating-ui/dom';
	storePopup.set({ computePosition, autoUpdate, flip, shift, offset, arrow });

	// Popup Tooltips
	let SwitchThemeSettings: PopupSettings = {
		event: 'hover',
		target: 'SwitchTheme',
		placement: 'top'
	};
	let SignOutTooltip: PopupSettings = {
		event: 'hover',
		target: 'SignOut',
		placement: 'right'
	};
	let SystemLanguageTooltip: PopupSettings = {
		event: 'hover',
		target: 'SystemLanguage',
		placement: 'right'
	};

	// Lucia
	import { page } from '$app/stores';
	import { getUser, handleSession } from '@lucia-auth/sveltekit/client';
	import { invalidateAll } from '$app/navigation';

	handleSession(page);
	const user = getUser();

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// typesafe-i18n
	import LocaleSwitcher from '$src/lib/LocaleSwitcher.svelte';
	import LL from '$i18n/i18n-svelte';

	// @ts-expect-error reading from vite.config.jss
	const pkg = __PACKAGE__;

	// ======================save data =======================
	import axios from 'axios';
	import entryListTableStore from '$src/lib/stores/entryListTable';

	async function signOut() {
		await invalidateAll();
	}
	let paging = { page: 1, entryLength: 10, totalCount: 0, lengthList: [10, 25, 50, 100, 500] };
	let totalPages = 0;
	let deleteMap: any = {};
	let refresh = async (collection: any) => {
		let entryList = [];

		({ entryList, totalCount: paging.totalCount } = await axios
			.get(`/api/${collection.name}?page=${paging.page}&length=${paging.entryLength}`)
			.then((data) => data.data));
		totalPages = Math.ceil(paging.totalCount / paging.entryLength);
		deleteMap = {};

		return { entryList, totalPages, deleteMap };
	};

	async function submit() {
		await saveFormData(collection);
		const { deleteMap, entryList, totalPages } = await refresh(collection);
		entryListTableStore.set({
			deleteMap,
			entryList,
			totalPages
		});
		$showFieldsStore.showForm = false;
		$entryData = undefined;
		const t: ToastSettings = {
			message: $LL.SBL_Save_message(),
			// Optional: Presets for primary | secondary | tertiary | warning
			//preset: 'success',
			// Optional: The auto-hide settings
			autohide: true,
			timeout: 3000
		};
		toastStore.trigger(t);
	}
	$: {
		$entryData = undefined;
		collection;
	}
	// ======================save data =======================

	// darkmode
	// TODO : USer Skeleton Dark mode with 3 states
	const toggleTheme = () => {
		$is_dark = window.document.documentElement.classList.toggle('dark');
		localStorage.setItem('is_dark', $is_dark ? 'true' : 'false');
	};

	// search filter
	let filterCollections = '';
	// collection parent names should hide on search
	function updateFilter(e: KeyboardEvent) {
		filterCollections = (e.target as HTMLInputElement).value.toLowerCase();
	}
	//shape_fields(collection.fields).then((data) => (fields = data));

	import { toggleLeftSidebar } from '$src/stores/store';

	var leftSidebarOn: boolean;
	toggleLeftSidebar.subscribe((n) => {
		leftSidebarOn = n;
	});

	// show/hide Right Sidebar
	let toggleRightSideBar = true;
	// show/hide Top Sidebar
	let toggleTopSideBar = true;
	// show/hide Footer
	let toggleFooter = true;
	// change sidebar width so only icons show

	let progress = 0;
	let submitDisabled = false;

	$: avatarSrc = $user?.avatar;
	let deleteMode: boolean;

	let valid = false;
	let collection = collections[0];
	let fields: any;
	// let refresh: (collection: any) => Promise<any>;
	let category = categories[0].category;

	const handleCategoryClick = (e: any) => {
		$showFieldsStore.collection_index = e.detail.collection_index;
		$showFieldsStore.category_index = e.detail.category_index;
	};

	// mobile detection
	import { browser } from '$app/environment';

	let isMobile = false;

	// bypass window is not defined error
	if (browser) {
		isMobile = window.matchMedia('only screen and (max-width: 480px)').matches;
	}

	$: if (isMobile) {
		toggleTopSideBar = !$showFieldsStore.showForm;
	} else {
		toggleRightSideBar = !$showFieldsStore.showForm;
	}
</script>

<!-- App Shell -->
<AppShell
	slotSidebarLeft="!overflow-visible bg-white dark:bg-gradient-to-r dark:from-surface-800 dark:via-surface-700
dark:to-surface-500 text-center h-full relative border-r !px-2 border-surface-300 flex flex-col items-center z-10 
{switchSideBar ? 'w-[225px]' : 'w-[85px]'}
{leftSidebarOn ? 'hidden' : 'block'}"
	slotSidebarRight="bg-white border-l border-surface-300 dark:bg-gradient-to-r dark:from-surface-600 dark:via-surface-700 dark:to-surface-800 text-center px-1 h-full relative {toggleRightSideBar
		? 'hidden'
		: 'block'} "
	slotPageHeader="bg-white dark:bg-gradient-to-t border-b dark:from-surface-600 dark:via-surface-700 dark:to-surface-800 text-center px-1 pb-2 relative {toggleTopSideBar
		? 'hidden'
		: 'block'} "
	slotPageFooter="bg-white dark:bg-gradient-to-b dark:from-surface-600 dark:via-surface-700 dark:to-surface-800 text-center px-1 relative h-40 border-t relative {toggleFooter
		? 'hidden'
		: 'block'} "
>
	<!-- Header -->
	<svelte:fragment slot="header">
		<AppBar border="border-b">
			<svelte:fragment slot="lead">
				<strong class="text-xl uppercase">{PUBLIC_SITENAME}</strong>
			</svelte:fragment>

			<button on:click={() => toggleLeftSidebar.update((n) => !n)} class="btn btn-base"
				>SD-Left</button
			>

			<button
				on:click={() => (toggleTopSideBar = !toggleTopSideBar)}
				class="btn btn-base btn-varriant-surface">SD-Top</button
			>

			<svelte:fragment slot="trail">
				<button
					on:click={() => (toggleRightSideBar = !toggleRightSideBar)}
					class="btn btn-base btn-varriant-surface">SD-Right</button
				>
				<button
					on:click={() => (toggleFooter = !toggleFooter)}
					class="btn btn-base btn-varriant-surface">Footer</button
				>
			</svelte:fragment>
		</AppBar>
	</svelte:fragment>

	<!-- Sidebar Left -->
	<svelte:fragment slot="sidebarLeft">
		{#if !switchSideBar}
			<AnimatedHamburger />
		{/if}

		<!-- Corporate Identity -->
		<a href="/" class="pt-2 flex !no-underline">
			<SimpleCmsLogo fill="red" className="h-8" />
			{#if switchSideBar}
				<span class="pl-1 text-2xl font-bold text-black dark:text-white">{PUBLIC_SITENAME}</span>
			{/if}
		</a>

		<!-- sidebar collapse button -->
		<button
			class="absolute top-2 -right-3 rounded-full border-2 border-surface-300"
			on:click={() => (switchSideBar = !switchSideBar)}
		>
			{#if !switchSideBar}
				<!-- Icon Collpased -->
				<Icon
					icon="bi:arrow-left-circle-fill"
					width="30"
					class="rotate-180 rounded-full bg-white text-surface-500 hover:cursor-pointer hover:bg-error-600 dark:text-surface-600 dark:hover:bg-error-600"
				/>
			{:else}
				<!-- Icon expanded -->
				<Icon
					icon="bi:arrow-left-circle-fill"
					width="30"
					class="rounded-full bg-white text-surface-500 hover:cursor-pointer hover:bg-error-600 dark:text-surface-600 dark:hover:bg-error-600"
				/>
			{/if}
		</button>

		<!-- Search Collections -->
		<!-- TODO: perhaps overflow is better? -->
		<div class="mx-auto my-2 max-w-full">
			<div class="relative mx-auto ">
				{#if !switchSideBar}
					<input
						on:keyup={updateFilter}
						on:focus={() => (switchSideBar = !switchSideBar)}
						placeholder={$LL.SBL_Search()}
						class="relative z-10 h-10 w-10 cursor-pointer !rounded-full border border-surface-700 bg-surface-300/50 pl-12 text-black shadow-xl outline-none focus:w-full focus:cursor-text focus:rounded-sm dark:bg-surface-600/50 dark:text-white md:mt-0 md:h-12"
					/>
				{:else}
					<input
						on:keyup={updateFilter}
						placeholder={$LL.SBL_Search()}
						class="relative z-10 h-10 w-full cursor-pointer rounded-md border border-surface-700 bg-surface-300/50 pl-12 text-black shadow-xl outline-none focus:cursor-text dark:bg-surface-600/50 dark:text-white"
					/>
				{/if}

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
		</div>

		<!--SideBar Middle -->
		<CollectionsLatest
			on:collection_click={handleCategoryClick}
			{switchSideBar}
			data={categories}
			{filterCollections}
			bind:fields
			bind:collection
			bind:category
		/>

		<!-- Sidebar Left Footer -->
		<div
			class="absolute inset-x-0 bottom-1 bg-white dark:bg-gradient-to-r dark:from-surface-800 dark:via-surface-700 dark:to-surface-500"
		>
			<div class="border-t border-surface-400 mx-1 mb-2" />

			{#if switchSideBar}
				<div
					hidden={leftSidebarOn}
					class="grid grid-cols-2 md:grid-cols-3 grid-rows-2 md:gap-2 items-center"
				>
					<div class="md:row-span-2">
						<!-- Avatar with user settings -->
						<a href="/user" class="relative flex-col !no-underline ">
							<Avatar src={avatarSrc ?? '/Default_User.svg'} class="mx-auto w-12" />
							<div class="text-center text-[9px] text-black dark:text-white">
								{#if $user?.username}
									<div class="text-xs uppercase">{$user?.username}</div>
								{/if}
							</div>
						</a>
					</div>

					<!-- light/dark mode switch -->
					<button
						use:popup={SwitchThemeSettings}
						on:click={toggleTheme}
						class="!overflow-visible btn btn-sm relative p-2 text-sm text-surface-500 hover:bg-surface-100 focus:outline-none dark:text-white dark:hover:bg-surface-700 dark:focus:ring-surface-700"
					>
						{#if $is_dark}
							<Icon icon="bi:sun" width="16" />
						{:else}
							<Icon icon="bi:moon-fill" width="16" />
						{/if}
						<!-- Popup Tooltip with the arrow element -->
						<div class="card variant-filled-secondary p-4" data-popup="SwitchTheme">
							{`Switch to ${$is_dark ? 'Light' : 'Dark'} Mode`}
							<div class="arrow variant-filled-secondary" />
						</div>
					</button>

					<div use:popup={SystemLanguageTooltip} class="md:row-span-2">
						<!-- System Language i18n Handeling -->
						<!-- <LocaleSwitcher /> -->
						<!-- TODO: POPUP is blocking selection -->
						<!-- Popup Tooltip with the arrow element -->
						<div class="card variant-filled-secondary p-4" data-popup="SystemLanguage">
							{$LL.SBL_SystemLanguage()}
							<div class="arrow variant-filled-secondary" />
						</div>
					</div>
					<!-- Lucia Sign Out -->
					<form
						action="?/signOut"
						method="post"
						use:enhance={async (e) => {
							invalidateAll();
						}}
						class="-mt-2"
					>
						<button
							use:popup={SignOutTooltip}
							on:click={signOut}
							type="submit"
							value="Sign out"
							class="btn btn-sm md:text-xs uppercase hover:bg-surface-100 focus:outline-none dark:text-white dark:hover:bg-surface-700 dark:focus:ring-surface-700"
							><Icon icon="uil:signout" width="24" /></button
						>
						<!-- Popup Tooltip with the arrow element -->
						<div class="card variant-filled-secondary p-4" data-popup="SignOut">
							{$LL.SBL_SignOut()}.
							<div class="arrow variant-filled-secondary" />
						</div>
					</form>
				</div>

				<!-- CMS Version -->
				<div class="flex justify-center p-1 pb-2">
					<!-- <a href="https://github.com/Celestialme/SimpleCMS" target="blank"> -->
					<a href="https://github.com/Rar9/SvelteCMS/" target="blank">
						<span class="badge variant-filled-primary rounded-xl text-black"
							>{$LL.SBL_Version()}: {pkg.version}</span
						>
					</a>
				</div>
			{/if}
		</div>
	</svelte:fragment>

	<!-- Sidebar Right -->
	<svelte:fragment slot="sidebarRight">
		<!-- Desktop Save -->
		<div class="my-3 flex items-center justify-between">
			<button
				on:click={submit}
				type="submit"
				class="relative w-full max-w-[150px] h-[50px] rounded-lg bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 px-4 py-2 font-bold hover:bg-primary-500 focus:bg-primary-500 active:bg-primary-600 md:mt-2 md:max-w-[350px]"
				disabled={submitDisabled}
			>
				{#if progress !== 0}
					<div
						class="absolute top-1/3 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center text-xl uppercase"
					>
						<Icon icon="ph:floppy-disk-back" color="dark" width="30" class="mr-1" />
						Save
					</div>

					<div class="relative mx-auto mt-[27px] h-2 w-[90%] rounded-full bg-surface-500 px-4">
						<div
							class="absolute bottom-0 left-0 mt-4 h-2 w-full rounded bg-tertiary-500"
							style="width: {progress}%"
						/>
						<div class="absolute top-0 left-0 flex h-full w-full items-center justify-center ">
							<div class="p-[1.7px] rounded-full variant-filled-surface text-[9px]">
								{progress}%
							</div>
						</div>
					</div>
				{:else}
					<div class="flex items-center justify-center text-xl uppercase">
						<Icon icon="ph:floppy-disk-back" color="dark" width="30" class="mr-1" />
						Save
					</div>
				{/if}
			</button>
		</div>

		<!-- Desktop Center Admin area -->
		<div class="">Admin Center Area</div>

		<!-- Form Info  -->
		<div class="absolute inset-x-0 bottom-2">
			<div class="border-t border-surface-400 mx-1 mb-2" />
			Form Info
		</div>
	</svelte:fragment>

	<!-- Page Header -->
	<svelte:fragment slot="pageHeader">
		<!-- Mobile Save -->

		<button class="btn variant-filled-primary my-1" on:click={submit}>
			<span><Icon icon="ph:floppy-disk-back" color="dark" width="30" class="mr-1" /></span>
			Save</button
		>

		<ProgressBar value={50} max={100} meter="bg-tertiary-500" track="bg-surface-500" />

		<!-- Mobile Close -->
		<button
			on:click={() => ((toggleTopSideBar = !toggleTopSideBar), ($showFieldsStore.showForm = false))}
			class="btn absolute top-2 right-2">Close</button
		>
	</svelte:fragment>

	<!-- Router Slot -->
	<Modal />
	<Toast />
	<div class="m-2">
		<slot />
	</div>

	<!-- Page Footer -->
	<svelte:fragment slot="pageFooter">
		Page Footer
		<!-- Mobile  Admin area -->
		<div class="">Mobile Admin Center Area</div>

		<!--  Mobile Form Info  -->
		<div class="">Mobile Form Info</div>
	</svelte:fragment>

	<!-- Footer -->
	<svelte:fragment slot="footer" />
</AppShell>
