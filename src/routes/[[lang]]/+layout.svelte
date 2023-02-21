<script lang="ts">
	// Skeleton
	import { AppShell, AppBar } from '@skeletonlabs/skeleton';
	import { Avatar } from '@skeletonlabs/skeleton';
	import { Modal, modalStore } from '@skeletonlabs/skeleton';
	import { Toast, toastStore } from '@skeletonlabs/skeleton';
	import type { ToastSettings } from '@skeletonlabs/skeleton';
	import { tooltip } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';
	import { ProgressBar } from '@skeletonlabs/skeleton';

	let valueSingle = 'books';

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
	import { locale } from '$i18n/i18n-svelte';
	import LocaleSwitcher from '$src/lib/LocaleSwitcher.svelte';
	import LL from '$i18n/i18n-svelte';

	// Sveltekit
	import { fly } from 'svelte/transition';
	import { is_dark, entryData } from '$src/stores/store';
	import ToolTip from '$src/components/ToolTip.svelte';

	// @ts-expect-error reading from vite.config.jss
	const pkg = __PACKAGE__;

	import { PUBLIC_SITENAME } from '$env/static/public';
	import SimpleCmsLogo from '$src/components/icons/SimpleCMS_Logo.svelte';

	import collections, { categories } from '$src/collections';
	import Collections from '$src/components/Collections.svelte';
	import EntryList from '$src/components/EntryList.svelte';
	import Form from '$src/components/Form.svelte';
	import { saveFormData } from '$src/lib/utils/utils_svelte';

	// ======================save data =======================

	async function submit() {
		await saveFormData(collection);
		refresh(collection);
		showFields = false;
		$entryData = undefined;

		const t: ToastSettings = {
			message: $LL.SBL_Save_message(),
			// Optional: Presets for primary | secondary | tertiary | warning
			preset: 'success',
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
	import AnimatedHamburger from '$src/components/AnimatedHamburger.svelte';

	export let toggleLeftSideBar = true;
	export let open = false;
	export let onClickHambuger = (): void => {
		open = !open;
		toggleLeftSideBar = !toggleLeftSideBar;
	};

	// show/hide Right Sidebar
	let toggleRightSideBar = true;
	// show/hide Top Sidebar
	let toggleTopSideBar = true;
	// show/hide Footer
	let toggleFooter = true;
	// change sidebar width so only icons show

	let progress = 0;
	let submitDisabled = true;

	let switchSideBar = true;
	let avatarSrc = $user?.avatar;
	let toggleSideBar = true;
	let deleteMode: boolean;

	let valid = false;
	let collection = collections[0];
	let fields: any;
	let refresh: (collection: any) => Promise<any>;
	let showFields = false;
	let category = categories[0].category;
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
			class="bg-white dark:bg-gradient-to-r dark:from-surface-800 dark:via-surface-700 dark:to-surface-500 text-center px-1 h-full relative 
			{switchSideBar ? 'w-[225px]' : 'w-[80px]'}"
		>
			{#if !switchSideBar}
				<!-- mobile hamburger -->
				<AnimatedHamburger {open} {onClickHambuger} />
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
			<Collections
				data={categories}
				{filterCollections}
				{switchSideBar}
				bind:fields
				bind:collection
				bind:category
				bind:showFields
			/>

			<!--SideBar Middle -->
			<!-- Display Collections via skeleton-->
			<!-- {#if switchSideBar}
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
			{/if} -->

			<!-- Sidebar Left Footer -->
			<div
				class="absolute inset-x-0 bottom-1 bg-white dark:bg-gradient-to-r dark:from-surface-800 dark:via-surface-700 dark:to-surface-500"
			>
				<div class="border-t border-surface-400 mx-1 mb-2" />

				{#if switchSideBar}
					<div
						hidden={toggleLeftSideBar}
						class="grid overflow-hidden grid-cols-2 md:grid-cols-3 grid-rows-2 md:gap-2 items-center"
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
						<!-- use:tooltip={{ content: 'Skeleton', position: 'top' }} -->
						<button
							on:click={toggleTheme}
							class="!overflow-x-auto btn btn-sm relative p-2 text-sm text-surface-500 hover:bg-surface-100 focus:outline-none dark:text-white dark:hover:bg-surface-700 dark:focus:ring-surface-700"
						>
							{#if $is_dark}
								<Icon icon="bi:sun" width="16" />
							{:else}
								<Icon icon="bi:moon-fill" width="16" />
							{/if}
							<ToolTip
								position="right"
								text={`Switch to ${$is_dark ? 'Light' : 'Dark'} Mode`}
								class="bg-surface-500 text-black dark:text-white "
							/>
						</button>

						<div class="md:row-span-2">
							<!-- System Language i18n Handeling -->
							<LocaleSwitcher />
							<ToolTip
								position="right"
								text={$LL.SBL_Search()}
								class="bg-surface-500 text-black dark:text-white"
							/>
						</div>
						<!-- Lucia Sign Out -->
						<form
							action="?/"
							method="post"
							use:enhance={async () => {
								invalidateAll();
							}}
							class="-mt-2"
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
		</div>
	</svelte:fragment>

	<!-- Sidebar Right -->
	<svelte:fragment slot="sidebarRight">
		<div
			id="sidebar-right"
			hidden={toggleRightSideBar}
			class="bg-white dark:bg-gradient-to-r dark:from-surface-600 dark:via-surface-700 dark:to-surface-800 text-center px-1 h-full relative"
		>
			<!-- Desktop Save -->
			<div class="my-3 flex items-center justify-between">
				<button
					type="submit"
					class="relative w-full max-w-[150px] h-[50px] rounded-lg bg-gradient-to-br from-primary-400 via-primary-500 to-primary-600 px-4 py-2 font-bold hover:bg-primary-500 focus:bg-primary-500 active:bg-primary-600 md:mt-2 md:max-w-[350px]"
					disabled={submitDisabled}
				>
					{#if !progress === 0}
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
		</div>
	</svelte:fragment>

	<!-- Page Header -->
	<svelte:fragment slot="pageHeader">
		<div
			id="sidebar-right"
			hidden={toggleTopSideBar}
			class="bg-white dark:bg-gradient-to-t border-b dark:from-surface-600 dark:via-surface-700 dark:to-surface-800 text-center px-1 pb-2 relative"
		>
			<!-- Mobile Save -->

			<button class="btn variant-filled-primary my-1">
				<span>(icon)</span>Mobile Save button</button
			>

			<ProgressBar label="Progress" value={50} max={100} />

			<!-- Mobile Close -->
			<button class="btn absolute top-2 right-2">Close</button>
		</div>
	</svelte:fragment>

	<!-- Router Slot -->
	<Modal />
	<Toast />
	<div class="m-2">
		<slot />
	</div>

	<!-- <div class="m-2">
		<div class="content !mt-[60px] flex-grow md:!mt-0 md:flex-grow-0">
			{#if showFields}
				<Form {fields} {collection} bind:showFields />
			{/if}

			<div hidden={showFields}>
				<EntryList
					bind:toggleSideBar
					bind:showFields
					bind:deleteMode
					{collection}
					{category}
					bind:refresh
				/>
			</div>
		</div>
	</div> -->
	<!-- ---- / ---- -->

	<!-- Page Footer -->
	<svelte:fragment slot="pageFooter">
		<div
			id="footer"
			hidden={toggleFooter}
			class="bg-white dark:bg-gradient-to-b dark:from-surface-600 dark:via-surface-700 dark:to-surface-800 text-center px-1 relative h-40 border-t"
		>
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
