<script lang="ts">
	// Skeleton
	import { AppShell, AppBar } from '@skeletonlabs/skeleton';
	import { Avatar } from '@skeletonlabs/skeleton';
	import { Modal, modalStore } from '@skeletonlabs/skeleton';
	import { Toast, toastStore } from '@skeletonlabs/skeleton';
	import type { ToastSettings } from '@skeletonlabs/skeleton';
	import { tooltip } from '@skeletonlabs/skeleton';

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
	import { is_dark } from '$src/stores/store.ts';
	import ToolTip from '$src/components/ToolTip.svelte';

	import { PUBLIC_SITENAME, PUBLIC_PKG } from '$env/static/public';
	import SimpleCmsLogo from '$src/components/icons/SimpleCMS_Logo.svelte';

	// darkmode
	const toggleTheme = () => {
		$is_dark = window.document.documentElement.classList.toggle('dark');
		localStorage.setItem('is_dark', $is_dark ? 'true' : 'false');
	};

	// show/hide Left Sidebar
	let toggleLeftSideBar = false;
	// show/hide Right Sidebar
	let toggleRightSideBar = true;
	// show/hide Top Sidebar
	let toggleTopSideBar = true;
	// show/hide Footer
	let toggleFooter = true;
	// change sidebar width so only icons show
	let switchSideBar = true;
</script>

<!-- App Shell -->

<AppShell>
	<!-- Header -->
	<svelte:fragment slot="header">
		<AppBar border="border-b">
			<svelte:fragment slot="lead">
				<strong class="text-xl uppercase">forTest</strong>
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
			class="bg-white dark:bg-surface-500 text-center h-full"
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

			<!-- Corporate Identity -->
			<a href="/" class="1 mt-2 flex cursor-pointer items-center justify-start !no-underline ">
				<SimpleCmsLogo fill="red" className="h-8 ml-[10px] " />
				{#if switchSideBar}
					<span class="ml-2 mt-1 text-2xl font-bold text-black dark:text-white"
						>{PUBLIC_SITENAME}</span
					>
				{/if}
			</a>

			<!-- Search Collections -->
			<div>Search</div>

			<!-- Display Collections -->
			<div>Collections</div>
			<!-- <Collections
			data={categories}
			{filterCollections}
			{switchSideBar}
			bind:fields
			bind:collection
			bind:category
			bind:showFields
		/> -->

			<!-- Avatar with user settings -->
			<a href="/user" class="relative flex-col">
				<Avatar src={'https://i.pravatar.cc/' || '/Default_User.svg'} class="mx-auto" />
				<div class="text-center text-[9px] text-surface-400 dark:text-white">
					{#if $user?.username}
						<div class="text-base no-underline">{$user?.username}</div>
					{/if}
				</div>
			</a>

			<!-- Lucia Sing Out -->
			<form
				action="?/signOut"
				method="post"
				use:enhance={async () => {
					invalidateAll();
				}}
			>
				<button type="submit">Sign out</button>
			</form>

			<!-- System Language i18n Handeling -->
			<a class="btn btn-sm btn-ghost-surface" href="/" target="_blank" rel="noreferrer"
				>Language
			</a>
			<!-- light/dark mode switch -->
			<div class="-ml-2">
				<button
					on:click={toggleTheme}
					class="btn btn-sm relative  p-2.5 text-sm text-surface-500 hover:bg-surface-100 focus:outline-none dark:text-surface-400 dark:hover:bg-surface-700 dark:focus:ring-surface-700"
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

			<!-- CMS Version -->
			<div class="flex justify-center p-1 pb-2">
				<a href="https://github.com/Celestialme/SimpleCMS" target="blank">
					<span class="badge variant-filled-primary rounded-xl text-black"
						>{$LL.SBL_Version()}: {PUBLIC_PKG}</span
					>
				</a>
			</div>
		</div>
	</svelte:fragment>

	<!-- Sidebar Right -->
	<svelte:fragment slot="sidebarRight">
		<div id="sidebar-right" hidden={toggleRightSideBar} class="bg-red-500 text-center h-full ">
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
