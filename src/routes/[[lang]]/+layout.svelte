<script lang="ts">
	import { AppShell, AppBar } from '@skeletonlabs/skeleton';
	import { Avatar } from '@skeletonlabs/skeleton';

	// load public Environment Variables
	//import SITENAME from '$env/static/private';

	//Lucia
	import { page } from '$app/stores';
	import { getUser, handleSession } from '@lucia-auth/sveltekit/client';

	import { invalidateAll } from '$app/navigation';
	import { enhance } from '$app/forms';

	handleSession(page);

	// show/hide Left Sidebar
	let toggleLeftSideBar = true;
	// show/hide Right Sidebar
	let toggleRightSideBar = true;
	// show/hide Top Sidebar
	let toggleTopSideBar = true;

	const user = getUser();
	console.log($user);
</script>

<!-- App Shell -->
<AppShell>
	<!-- Header -->
	<svelte:fragment slot="header">
		<AppBar border="border-b">
			<svelte:fragment slot="lead">
				<strong class="text-xl uppercase">test</strong>
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
			</svelte:fragment>
		</AppBar>
	</svelte:fragment>

	<!-- Sidebar Left -->
	<svelte:fragment slot="sidebarLeft">
		<div id="sidebar-right" hidden={toggleLeftSideBar} class="bg-green-500 h-full w-40 text-center">
			Sidebar
			<a href="/user" class="relative flex-col">
				<Avatar src={'https://i.pravatar.cc/' || '/Default_User.svg'} class="mx-auto" />
				<div class="text-center text-[9px] text-surface-400 dark:text-white">
					{#if $user?.lastname}
						User:{$user?.lastname}
					{:else}
						User:{$user?.email}
					{/if}
				</div>
			</a>

			<form
				action="?/signOut"
				method="post"
				use:enhance={async () => {
					invalidateAll();
				}}
			>
				<button type="submit">Sign out </button>
			</form>

			<a class="btn btn-sm btn-ghost-surface" href="/" target="_blank" rel="noreferrer"
				>Language
			</a>
		</div>
	</svelte:fragment>

	<!-- Sidebar Right -->
	<svelte:fragment slot="sidebarRight">
		<div id="sidebar-right" hidden={toggleRightSideBar} class="bg-red-500 h-full w-40">Sidebar</div>
	</svelte:fragment>

	<!-- Page Header -->
	<svelte:fragment slot="pageHeader">
		<div id="sidebar-right" hidden={toggleTopSideBar} class="bg-pink-500 h-40">Page Header</div>
	</svelte:fragment>

	<!-- Router Slot -->
	<slot />
	<!-- ---- / ---- -->

	<!-- Page Footer -->
	<svelte:fragment slot="pageFooter">
		<div class="text-center">Page Footer</div>
	</svelte:fragment>

	<!-- Footer -->
	<svelte:fragment slot="footer">
		<div class="text-center">Footer</div>
	</svelte:fragment>
</AppShell>
