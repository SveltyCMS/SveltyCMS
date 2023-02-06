<script lang="ts">
	// Skeleton
	import { AppShell, AppBar } from '@skeletonlabs/skeleton';
	import { Avatar } from '@skeletonlabs/skeleton';
	import { Modal, modalStore } from '@skeletonlabs/skeleton';
	import { Toast, toastStore } from '@skeletonlabs/skeleton';
	import type { ToastSettings } from '@skeletonlabs/skeleton';
	import { tooltip } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';

	let valueSingle: string = 'books';

	// Lucia
	import { page } from '$app/stores';
	import { getUser, handleSession } from '@lucia-auth/sveltekit/client';

	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';

	handleSession(page);
	const user = getUser();

	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// typesafe-i18n
	import { setLocale } from '$i18n/i18n-svelte';
	import LL from '$i18n/i18n-svelte';

	// Sveltekit
	import { fly } from 'svelte/transition';
	import { is_dark, entryData } from '$src/stores/store.ts';
	import ToolTip from '$src/components/ToolTip.svelte';

	// @ts-expect-error reading from vite.config.jss
	const pkg = __PACKAGE__;

	import { PUBLIC_SITENAME } from '$env/static/public';
	import SimpleCmsLogo from '$src/components/icons/SimpleCMS_Logo.svelte';
	// import collections, { categories } from '$src/collections';
	// import Collections from '$src/components/Collections.svelte';
	// import EntryList from '$src/components/EntryList.svelte';
	// import Form from '$src/components/Form.svelte';
	// import { saveFormData } from '$src/lib/utils/utils_svelte';

	// ======================save data =======================

	// async function submit() {
	// 	await saveFormData(collection);
	// 	refresh(collection);
	// 	showFields = false;
	// 	$entryData = undefined;

	// 	const t: ToastSettings = {
	// 		message: $LL.SBL_Save_message(),
	// 		// Optional: Presets for primary | secondary | tertiary | warning
	// 		preset: 'success',
	// 		// Optional: The auto-hide settings
	// 		autohide: true,
	// 		timeout: 3000
	// 	};
	// 	toastStore.trigger(t);
	// }

	// $: {
	// 	$entryData = undefined;
	// 	collection;
	// }

	// ======================save data =======================

	// darkmode
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

	// show/hide Left Sidebar
	export let toggleLeftSideBar = false;
	// show/hide Right Sidebar
	let toggleRightSideBar = true;
	// show/hide Top Sidebar
	let toggleTopSideBar = true;
	// show/hide Footer
	let toggleFooter = true;
	// change sidebar width so only icons show
	let switchSideBar = true;
	let avatarSrc = $user?.avatar;
	// let toggleSideBar = true;
	// let deleteMode: boolean;

	// let valid = false;
	// let collection = collections[0];
	// let fields: any;
	// let refresh: (collection: any) => Promise<any>;
	// let showFields = false;
	// let category = categories[0].category;
</script>

<!-- App Shell -->

<AppShell>
	<!-- Header -->
	<svelte:fragment slot="header">
		<AppBar border="border-b">
			<svelte:fragment slot="lead">
				<strong class="text-xl uppercase">{PUBLIC_SITENAME}</strong>
			</svelte:fragment>

			<button on:click={() => (toggleLeftSideBar = !toggleLeftSideBar)} class="btn btn-base"
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
		<div
			id="sidebar-right"
			in:fly={{ x: -200, duration: 500 }}
			out:fly={{ x: -200, duration: 500 }}
			hidden={toggleLeftSideBar}
			class="bg-white dark:bg-surface-500 border-r text-center px-1 h-full overflow-visible relative 
			{switchSideBar ? 'w-[225px]' : 'w-[80px]'}"
		>
			{#if !switchSideBar}
				<!-- mobile hamburger -->
				<div class="flex items-center md:hidden ml-1">
					<button
						class="btn btn-sm mt-2 -ml-2 text-white "
						on:click={() => (toggleLeftSideBar = !toggleLeftSideBar)}
					>
						<span>
							<svg viewBox="0 0 100 80" class="fill-token h-4 w-4">
								<rect width="100" height="20" />
								<rect y="30" width="100" height="20" />
								<rect y="60" width="100" height="20" />
							</svg>
						</span>
					</button>
				</div>
			{/if}

			<!-- sidebar collapse button -->
			<button
				class="absolute top-2 -right-2 rounded-full border-2 border-surface-300"
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

			<!-- Corporate Identity -->
			<a href="/" class="1 pt-2 flex cursor-pointer items-center justify-start !no-underline ">
				<SimpleCmsLogo fill="red" className="h-8 ml-[10px] pr-1" />
				{#if switchSideBar}
					<span class="pr-1 text-2xl font-bold text-black dark:text-white">{PUBLIC_SITENAME}</span>
				{/if}
			</a>

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
			<!-- Display Collections -->
			<!-- <Collections
				data={categories}
				{filterCollections}
				{switchSideBar}
				bind:fields
				bind:collection
				bind:category
				bind:showFields
			/> -->

			<!--SideBar Middle -->
			<!-- Display Collections -->
			{#if switchSideBar}
				<ListBox padding="px-4 py-1">
					<ListBoxItem bind:group={valueSingle} name="Collections" value="Collections">
						<svelte:fragment slot="lead">(icon)</svelte:fragment>
						Collection
					</ListBoxItem>
					<ListBox padding="px-4 py-1">
						<ListBoxItem bind:group={valueSingle} name="test1" value="test1">
							<svelte:fragment slot="lead">(icon)</svelte:fragment>
							Child1
						</ListBoxItem>
						<ListBoxItem bind:group={valueSingle} name="test2" value="test2">
							<svelte:fragment slot="lead">(icon)</svelte:fragment>
							Child2
						</ListBoxItem>
					</ListBox>
				</ListBox>
			{:else}
				<ListBox padding="px-4 py-1">
					<ListBoxItem
						bind:group={valueSingle}
						name="Collections"
						value="Collections"
						class="flex justify-center items-center"
					>
						<div>Collection</div>
						<div>(icon)</div>
					</ListBoxItem>
					<ListBox padding="px-4 py-1">
						<ListBoxItem
							bind:group={valueSingle}
							name="test1"
							value="test1"
							class="flex justify-center items-center"
						>
							<div>Test1</div>
							<div>(icon)</div>
						</ListBoxItem>
						<ListBoxItem
							bind:group={valueSingle}
							name="test2"
							value="test2"
							class="flex justify-center items-center"
						>
							<div>Test2</div>
							<div>(icon)</div>
						</ListBoxItem>
					</ListBox>
				</ListBox>
			{/if}

			<!-- Sidebar Left Footer -->
			<div class="absolute inset-x-0 bottom-1">
				{#if switchSideBar}
					<div
						class="grid overflow-hidden grid-cols-2 md:grid-cols-3 grid-rows-2 md:gap-2 items-center"
					>
						<div class="md:row-span-2">
							<!-- Avatar with user settings -->
							<a href="/user" class="relative flex-col !no-underline ">
								<Avatar src={avatarSrc ?? '/Default_User.svg'} class="mx-auto w-14" />
								<div class="text-center text-[9px] text-black dark:text-white">
									{#if $user?.username}
										<div class="text-xs uppercase">{$user?.username}</div>
									{/if}
								</div>
							</a>
						</div>
						<div class="">
							<!-- light/dark mode switch -->
							<button
								on:click={toggleTheme}
								class="btn btn-sm relative p-2 text-sm text-surface-500 hover:bg-surface-100 focus:outline-none dark:text-white dark:hover:bg-surface-700 dark:focus:ring-surface-700"
							>
								{#if $is_dark}
									<Icon icon="bi:sun" width="16" />
								{:else}
									<Icon icon="bi:moon-fill" width="16" />
								{/if}
								<ToolTip
									position="right"
									text={`Switch to ${$is_dark ? 'Light' : 'Dark'} Mode`}
									class="bg-surface-500 text-black dark:text-white"
								/>
							</button>
						</div>
						<div class="md:row-span-2">
							<!-- System Language i18n Handeling -->
							<a
								class="btn btn-sm btn-ghost-surface hover:bg-surface-100 focus:outline-none dark:text-white dark:hover:bg-surface-700 dark:focus:ring-surface-700"
								href="/"
								target="_blank"
								rel="noreferrer"
								>EN/DE
							</a>
							<ToolTip
								position="right"
								text={$LL.SBL_Search()}
								class="bg-surface-500 text-black dark:text-white"
							/>
						</div>
						<div class="">
							<!-- Lucia Sign Out -->
							<form
								action="?/signOut"
								method="post"
								use:enhance={async () => {
									invalidateAll();
								}}
							>
								<button
									type="submit"
									value="Sign out"
									class="btn btn-sm md:text-xs uppercase hover:bg-surface-100 focus:outline-none dark:text-white dark:hover:bg-surface-700 dark:focus:ring-surface-700"
									><Icon icon="uil:signout" width="24" /></button
								><ToolTip
									position="right"
									text={$LL.SBL_Search()}
									class="bg-surface-500 text-black dark:text-white"
								/>
							</form>
						</div>
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

					<div class="mt-auto border-t border-surface-500 pt-2 ">
						<div class="my-1 flex items-center justify-between" />
					</div>{/if}
			</div>
		</div>
	</svelte:fragment>

	<!-- Sidebar Right -->
	<svelte:fragment slot="sidebarRight">
		<div id="sidebar-right" hidden={toggleRightSideBar} class="bg-red-500 text-center h-full">
			<!-- Desktop Save -->
			<div class="">Save button</div>

			<!-- Desktop Center Admin area -->
			<div class="">Admin Center Area</div>

			<!-- Form Info  -->
			<div class="">Form Info</div>
		</div>
	</svelte:fragment>

	<!-- Page Header -->
	<svelte:fragment slot="pageHeader">
		<div id="sidebar-right" hidden={toggleTopSideBar} class="bg-pink-500 h-40 text-center">
			<!-- Mobile Save -->
			<div class="">Mobile Save button</div>

			<!-- Mobile Close -->
			<div class="">Close</div>

			<!-- Mobile Save -->
			<div class="">Form Progress</div>
		</div>
	</svelte:fragment>

	<!-- Router Slot -->
	<Modal />
	<Toast />
	<div class="m-2">
		<slot />
	</div>

	<!-- ---- / ---- -->

	<!-- Page Footer -->
	<svelte:fragment slot="pageFooter">
		<div id="footer" hidden={toggleFooter} class="bg-blue-500 h-40 text-center">
			Page Footer

			<!-- Mobile  Admin area -->
			<div class="">Mobile Admin Center Area</div>

			<!--  Mobile Form Info  -->
			<div class="">Mobile Form Info</div>
		</div>
	</svelte:fragment>

	<!-- Footer -->
	<svelte:fragment slot="footer" />
</AppShell>
