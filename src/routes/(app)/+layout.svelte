<!--
@file src/routes/(app)/+layout.svelte
@description: This component renders the entire app with improved loading strategy.

Key features:
-     Skeleton UI framework for SvelteKit
-     Dynamic theme management based on user preferences or defaults
-     SEO optimization with Open Graph and Twitter Card metadata for enhanced social sharing
-     Initialization of Skeleton stores for UI components
-     Granular loading strategy
-     Asynchronous loading of non-critical data
-->

<script lang="ts">
	// Your selected Skeleton theme:
	import '../../app.postcss';

	// Icons from https://icon-sets.iconify.design/
	import 'iconify-icon';

	import { publicEnv } from '@root/config/public';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	// Utils
	import { getTextDirection } from '@utils/utils';
	import { isSearchVisible } from '@utils/globalSearchIndex';

	// Stores
	import { page } from '$app/stores';
	import { contentLanguage, systemLanguage, isLoading } from '@stores/store';
	import { collection, collectionValue } from '@stores/collectionStore';
	import { sidebarState } from '@stores/sidebarStore';
	import { screenSize } from '@stores/screenSizeStore';

	// Components
	import { getCollections } from '@collections';
	import Loading from '@components/Loading.svelte';
	import SearchComponent from '@components/SearchComponent.svelte';
	import LeftSidebar from '@components/LeftSidebar.svelte';
	import RightSidebar from '@components/RightSidebar.svelte';
	import HeaderEdit from '@components/HeaderEdit.svelte';
	import PageFooter from '@components/PageFooter.svelte';
	import FloatingNav from '@components/system/FloatingNav.svelte';

	// Skeleton
	import { initializeStores, Modal, Toast, setModeUserPrefers, setModeCurrent, setInitialClassState } from '@skeletonlabs/skeleton';
	// Required for popups to function
	import { computePosition, autoUpdate, offset, shift, flip, arrow } from '@floating-ui/dom';
	import { storePopup } from '@skeletonlabs/skeleton';

	storePopup.set({ computePosition, autoUpdate, offset, shift, flip, arrow });
	initializeStores();

	export let data: any;

	$: contentLanguage.set(data.language);

	let isCollectionsLoaded = false;
	let isNonCriticalDataLoaded = false;

	// Function to load critical data (collections)
	async function loadCriticalData() {
		try {
			const { getCollections } = await import('@collections');
			await getCollections();
			isCollectionsLoaded = true;
		} catch (error) {
			console.error('Error loading critical data:', error);
		}
	}

	// Function to load non-critical data
	async function loadNonCriticalData() {
		// Simulate loading of additional data
		await new Promise((resolve) => setTimeout(resolve, 2000));
		isNonCriticalDataLoaded = true;
	}

	// Function to handle collection changes
	function handleCollectionChange(newCollection) {
		if (!newCollection) return;
		$collectionValue = {};
		const newPath = `/${$contentLanguage || publicEnv.DEFAULT_CONTENT_LANGUAGE}/${newCollection.name}`;
		if ($page.url.pathname !== newPath) {
			goto(newPath);
		}
	}

	// Subscribe to changes in the collection store
	$: handleCollectionChange($collection);

	// Subscribe to Setup System language
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
			isSearchVisible.update((prev) => !prev);
			event.preventDefault();
		}
	};

	onMount(() => {
		// Match media query for dark mode preference
		const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		mediaQuery.addEventListener('change', updateThemeBasedOnSystemPreference);

		// Check for saved theme preference in localStorage
		const savedTheme = localStorage.getItem('theme');
		if (savedTheme) {
			const newMode = savedTheme === 'light';
			setModeUserPrefers(newMode);
			setModeCurrent(newMode);
		}

		// Keyboard event listener for toggling search visibility
		document.addEventListener('keydown', onKeyDown);

		loadCriticalData();
		loadNonCriticalData();

		return () => {
			// Cleanup: remove event listener and subscription
			mediaQuery.removeEventListener('change', updateThemeBasedOnSystemPreference);
			document.removeEventListener('keydown', onKeyDown);
		};
	});

	// SEO
	const SeoTitle = `${publicEnv.SITE_NAME} - powered with sveltekit`;
	const SeoDescription = `${publicEnv.SITE_NAME} - a modern, powerful, and easy-to-use CMS powered by SvelteKit. Manage your content with ease & take advantage of the latest web technologies.`;
</script>

<svelte:head>
	<!-- Dark Mode -->
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
	<div class="flex h-lvh items-center justify-between lg:justify-start">
		<Loading />
	</div>
{:then}
	<!-- hack as root +layout cannot be overwritten ? -->
	{#if $page.url.pathname === '/login'}
		<slot />
	{:else}
		<!-- Body -->
		<div class="flex h-lvh flex-col">
			<!-- Header -->
			{#if $sidebarState.header !== 'hidden'}
				<header class="sticky top-0 z-10 bg-tertiary-500">Header</header>
			{/if}

			<div class="flex flex-1 overflow-hidden">
				<!-- Sidebar Left -->
				{#if $sidebarState.left !== 'hidden'}
					<aside
						class="max-h-dvh {$sidebarState.left === 'full'
							? 'w-[220px]'
							: 'w-fit'} relative border-r bg-white !px-2 text-center dark:border-surface-500 dark:bg-gradient-to-r dark:from-surface-700 dark:to-surface-900"
					>
						{#if isCollectionsLoaded}
							<LeftSidebar />
						{:else}
							<div>Loading sidebar...</div>
						{/if}
					</aside>
				{/if}

				<!-- Content Area -->
				<main class="relative w-full flex-1 overflow-hidden">
					<!-- Page Header -->
					{#if $sidebarState.pageheader !== 'hidden'}
						<header class="sticky top-0 z-10 w-full">
							<HeaderEdit />
						</header>
					{/if}
					<!-- Router Slot -->

					<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
					<div
						on:keydown={onKeyDown}
						role="main"
						class="relative flex-grow overflow-auto {$sidebarState.left === 'full' ? 'mx-2' : 'mx-1'} {$screenSize === 'lg' ? 'mb-2' : 'mb-16'}"
					>
						{#key $page.url}
							<Toast />
							<Modal />

							{#if $screenSize !== 'lg'}
								<FloatingNav />
							{/if}

							<!-- Show globalSearchIndex  -->
							{#if $isSearchVisible}
								<SearchComponent />
							{/if}

							{#if $isLoading}
								<div class="flex h-screen items-center justify-center">
									<Loading />
								</div>
							{:else if !isCollectionsLoaded}
								<div>Loading content...</div>
							{:else}
								<slot />

								<!--<div>mode : {$mode}</div>							
							<div>screenSize : {$screenSize}</div>
							<div>sidebarState.left : {$sidebarState.left}</div>
							<div>sidebarState.right : {$sidebarState.right}</div>
							<div>sidebarState.pageheader : {$sidebarState.pageheader}</div>
							<div>sidebarState.pagefooter : {$sidebarState.pagefooter}</div>
							<div>sidebarState.header : {$sidebarState.header}</div>
							<div>sidebarState.footer : {$sidebarState.footer}</div> -->
							{/if}

							{#if isNonCriticalDataLoaded}
								<!-- Render components that depend on non-critical data -->
							{/if}
						{/key}
					</div>

					<!-- Page Footer -->
					{#if $sidebarState.pagefooter !== 'hidden'}
						<footer
							class="sticky left-0 top-[calc(100%-51px)] z-10 w-full border-t bg-surface-50 bg-gradient-to-b px-1 text-center dark:border-surface-500 dark:from-surface-700 dark:to-surface-900"
						>
							<PageFooter />
						</footer>
					{/if}
				</main>

				<!-- Sidebar Right -->
				{#if $sidebarState.right !== 'hidden'}
					<aside
						class="max-h-dvh w-[220px] border-l bg-surface-50 bg-gradient-to-r dark:border-surface-500 dark:from-surface-700 dark:to-surface-900"
					>
						{#if isCollectionsLoaded}
							<RightSidebar />
						{:else}
							<div>Loading sidebar...</div>
						{/if}
					</aside>
				{/if}
			</div>

			<!-- Footer -->
			{#if $sidebarState.footer !== 'hidden'}
				<footer class="bg-blue-500">Footer</footer>
			{/if}
		</div>
	{/if}
{:catch error}
	<div class="text-error-500">
		An error occurred: {error.message}
	</div>
{/await}
