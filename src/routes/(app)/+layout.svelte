<script lang="ts">
	// Your selected Skeleton theme:
	import '../../app.postcss';

	// Icons from https://icon-sets.iconify.design/
	import 'iconify-icon';

	//skeleton
	import {
		initializeStores,
		AppShell,
		Modal,
		Toast,
		setModeUserPrefers,
		setModeCurrent,
		setInitialClassState,
		getModeOsPrefers // TODO: get the current value of the store
	} from '@skeletonlabs/skeleton';

	//required for popups to function
	import { computePosition, autoUpdate, offset, shift, flip, arrow } from '@floating-ui/dom';
	import { storePopup } from '@skeletonlabs/skeleton';

	storePopup.set({ computePosition, autoUpdate, offset, shift, flip, arrow });
	initializeStores();

	// Stores
	import { isSearchVisible } from '@utils/globalSearchIndex';
	import { collections, collection, collectionValue, contentLanguage, defaultContentLanguage, systemLanguage, mode } from '@stores/store';
	import { page } from '$app/stores';
	import { getCollections } from '@collections';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { Schema } from '@collections/types';
	import { getTextDirection } from '@src/utils/utils';

	// Components
	import Loading from '@components/Loading.svelte';
	import { PUBLIC_SITENAME } from '$env/static/public';
	import SearchComponent from '@components/SearchComponent.svelte';
	import LeftSidebar from '@src/components/LeftSidebar.svelte';
	import RightSidebar from '@src/components/RightSidebar.svelte';
	import HeaderControls from '@components/HeaderControls.svelte';
	import Footer from '@src/components/Footer.svelte';

	// Use handleSidebarToggle as a reactive statement to automatically switch the correct sidebar
	import { handleSidebarToggle, screenWidth, sidebarState, toggleSidebar } from '@stores/sidebarStore';

	// Declare a ForwardBackward variable to track whether the user is navigating using the browser's forward or backward buttons
	let ForwardBackward: boolean = false;

	globalThis.onpopstate = async () => {
		// Set up an event listener for the popstate event
		ForwardBackward = true; // Set ForwardBackward to true to indicate that the user is navigating using the browser's forward or backward buttons

		// Update the value of the collection store based on the current page's collection parameter
		collection.set($collections.find((x) => x.name === $page.params.collection) as Schema);
	};

	// Subscribe to changes in the collection store and do redirects
	let initial = true;
	collection.subscribe(() => {
		if (!$collection) return;

		// Reset the value of the collectionValue store
		$collectionValue = {};

		if (!ForwardBackward && initial != true) {
			// If ForwardBackward is false and the current route is a collection route
			goto(`/${$contentLanguage || defaultContentLanguage}/${$collection.name}`);
		}
		initial = false;
		// Reset ForwardBackward to false
		ForwardBackward = false;
	});

	// Setup system language
	systemLanguage.subscribe((lang) => {
		if (!lang) return;

		const dir = getTextDirection(lang);
		if (!dir) return;

		// This need be replace with svelte equivalent code
		const rootNode = document.body?.parentElement;
		if (!rootNode) return;
		document.documentElement.dir = dir;
		document.documentElement.lang = lang;
	});

	// On page load get the saved theme
	const updateThemeBasedOnSystemPreference = (event) => {
		const prefersDarkMode = event.matches;
		setModeUserPrefers(prefersDarkMode);
		setModeCurrent(prefersDarkMode);
		localStorage.setItem('theme', prefersDarkMode ? 'dark' : 'light');
	};

	// Define the onKeyDown function at the top level of the script block
	const onKeyDown = (event: KeyboardEvent) => {
		if (event.altKey && event.key === 's') {
			toggleSearchVisibility();
			event.preventDefault();
		}
	};

	const toggleSearchVisibility = () => {
		isSearchVisible.update((prev) => !prev);
	};

	onMount(() => {
		// Match media query for dark mode preference
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		mediaQuery.addEventListener('change', updateThemeBasedOnSystemPreference);

		// Check for saved theme preference in localStorage
		const savedTheme = localStorage.getItem('theme');
		if (savedTheme) {
			let newMode = savedTheme === 'light';
			setModeUserPrefers(newMode);
			setModeCurrent(newMode);
		}

		// Keyboard event listener for toggling search visibility
		document.addEventListener('keydown', onKeyDown);

		return () => {
			// Cleanup: remove event listener and subscription
			mediaQuery.removeEventListener('change', updateThemeBasedOnSystemPreference);
			document.removeEventListener('keydown', onKeyDown);
		};
	});

	// SEO
	const SeoTitle = `${PUBLIC_SITENAME} - powered with sveltekit`;
	const SeoDescription = `${PUBLIC_SITENAME} - a modern, powerful, and easy-to-use CMS powered by SvelteKit. Manage your content with ease & take advantage of the latest web technologies.`;
</script>

<svelte:head>
	<!-- darkmode -->
	{@html '<script>(' + setInitialClassState.toString() + ')();</script>'}

	<!--Basic SEO-->
	<title>{SeoTitle}</title>
	<meta name="description" content={SeoDescription} />

	<!-- Open Graph -->
	<meta property="og:title" content={SeoTitle} />
	<meta property="og:description" content={SeoDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="/SveltyCMS.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:site_name" content={$page.url.origin} />

	<!-- Open Graph : Twitter-->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={SeoTitle} />
	<meta name="twitter:description" content={SeoDescription} />
	<meta name="twitter:image" content="/SveltyCMS.png" />
	<meta property="twitter:domain" content={$page.url.origin} />
	<meta property="twitter:url" content={$page.url.href} />
</svelte:head>

<!-- Wait for dynamic Collection import -->
<!-- TODO: Optimize this as this is not needed for ever page -->
{#await getCollections()}
	<div class="flex h-screen items-center justify-center">
		<Loading />
	</div>
{:then}
	<!-- hack as root +layout cannot be overwritten ? -->
	{#if $page.url.pathname === '/login'}
		<slot />
	{:else}
		<AppShell
			slotSidebarLeft="relative pt-2 !overflow-visible dark:bg-gradient-to-r bg-white dark:from-surface-700 dark:to-surface-900 text-center h-full relative border-r !px-2 dark:border-surface-500 flex flex-col z-10
	{$sidebarState.left === 'full' ? 'w-[220px]' : 'w-fit'}
	{$sidebarState.left === 'hidden' ? 'hidden' : 'block'}
	lg:overflow-y-scroll lg:max-h-screen}"
			slotSidebarRight="h-full relative border-r w-[200px] flex flex-col items-center bg-surface-50 border-l dark:border-surface-500 bg-gradient-to-r dark:from-surface-700 dark:to-surface-900 text-center p-2
	{$sidebarState.right === 'hidden' ? 'hidden' : 'block'}"
			slotPageHeader=" relative bg-surface-50 bg-gradient-to-t dark:from-surface-700 dark:to-surface-900 text-center px-1 border-b dark:border-surface-500
	{$sidebarState.header === 'hidden' ? 'hidden' : 'block'}"
			slotPageFooter="relative bg-surface-50 bg-gradient-to-b dark:from-surface-700 dark:to-surface-900 text-center px-1 border-t dark:border-surface-500
			{$sidebarState.footer === 'hidden' ? 'hidden' : 'block'}"
		>
			<svelte:fragment slot="sidebarLeft">
				<LeftSidebar />
			</svelte:fragment>

			<svelte:fragment slot="sidebarRight">
				<RightSidebar />
			</svelte:fragment>

			<svelte:fragment slot="pageHeader">
				<HeaderControls />
			</svelte:fragment>

			<!-- Router Slot -->
			<div on:keydown={onKeyDown} class={$sidebarState.left === 'full' ? 'mx-2' : 'mx-1'}>
				{#key $page.url}
					<Modal />
					<Toast />

					<!-- TODO: Add Search Component -->
					{#if $isSearchVisible == true}
						<!-- Show search component -->
						<SearchComponent />
					{/if}

					<slot />

					<!-- <div>mode : {$mode}</div>
					<div>screenWidth : {$screenWidth}</div>
					<div>sidebarState.left : {$sidebarState.left}</div>
					<div>sidebarState.right : {$sidebarState.right}</div>
					<div>sidebarState.header : {$sidebarState.header}</div>
					<div>sidebarState.footer : {$sidebarState.footer}</div> -->
				{/key}
			</div>

			<svelte:fragment slot="pageFooter">
				<Footer />
			</svelte:fragment>
		</AppShell>
	{/if}
{:catch error}
	<div class="text-error-500">
		An error occurred: {error.message}
	</div>
{/await}
