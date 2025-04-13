<!--
@file src/routes/(app)/+layout.svelte
@component
**This component renders the entire app with improved loading strategy and dynamic theme management**

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
	import '../../app.css';

	// Icons from https://icon-sets.iconify.design/
	import 'iconify-icon';

	import { publicEnv } from '@root/config/public';
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';

	// Utils
	import { getTextDirection } from '@utils/utils';
	import { isSearchVisible } from '@utils/globalSearchIndex';

	// Stores
	import { systemLanguage, isLoading } from '@stores/store.svelte';
	import { contentStructure, collections } from '@stores/collectionStore.svelte';
	import { mode } from '@stores/collectionStore.svelte';
	import { screenSize, ScreenSize } from '@stores/screenSizeStore.svelte';
	import { uiStateManager } from '@stores/UIStore.svelte';

	// Components
	import Loading from '@components/Loading.svelte';
	import SearchComponent from '@components/SearchComponent.svelte';
	import LeftSidebar from '@components/LeftSidebar.svelte';
	import RightSidebar from '@components/RightSidebar.svelte';
	import HeaderEdit from '@components/HeaderEdit.svelte';
	import PageFooter from '@components/PageFooter.svelte';
	import FloatingNav from '@components/system/FloatingNav.svelte';

	// Skeleton
	import { Modal } from '@skeletonlabs/skeleton-svelte';

	// Props
	interface Props {
		children?: import('svelte').Snippet;
		data: { contentStructure: any; nestedContentStructure: any; contentLanguage: string; systemLanguage: string };
	}

	let { children, data }: Props = $props();

	// State variables
	let isCollectionsLoaded = $state(false);
	let isNonCriticalDataLoaded = $state(false);
	let loadError = $state<Error | null>(null);

	// Update collection loaded state when store changes
	$effect(() => {
		if (collections.value && Object.keys(collections.value).length > 0) {
			isCollectionsLoaded = true;
		}
	});

	// Handle system language changes
	$effect(() => {
		const lang = systemLanguage.value;
		if (!lang) return;

		const dir = getTextDirection(lang);
		if (!dir) return;

		document.documentElement.dir = dir;
		document.documentElement.lang = lang;
	});

	// Function to initialize collections using ContentManager
	async function initializeCollections() {
		try {
			// console.log('Loading collections...', data);
			contentStructure.set(data.nestedContentStructure);
			isCollectionsLoaded = true;
		} catch (error) {
			console.error('Error loading collections:', error);
			loadError = error instanceof Error ? error : new Error('Unknown error occurred while loading collections');
		}
	}

	// Function to load non-critical data
	async function loadNonCriticalData() {
		await new Promise((resolve) => setTimeout(resolve, 2000));
		isNonCriticalDataLoaded = true;
	}

	// Keyboard shortcuts
	function onKeyDown(event: KeyboardEvent) {
		if (event.altKey && event.key === 's') {
			event.preventDefault();
			isSearchVisible.update((v) => !v);
		}
	}

	// React to mode and screen size changes
	$effect(() => {
		mode.value; // Depend on mode
		screenSize.value; // Depend on screen size
		uiStateManager.updateLayout();
	});

	onMount(() => {
		// Event listeners
		window.addEventListener('keydown', onKeyDown);
		// Initialize data
		initializeCollections();
		loadNonCriticalData();
	});

	onDestroy(() => {
		window.removeEventListener('keydown', onKeyDown);
	});

	// SEO
	const SeoTitle = `${publicEnv.SITE_NAME} - powered with SvelteKit`;
	const SeoDescription = `${publicEnv.SITE_NAME} - a modern, powerful, and easy-to-use CMS powered by SvelteKit.`;
</script>

<svelte:head>
	<!-- Dark Mode -->
	<!-- {@html '<script>(' + setInitialClassState.toString() + ')();</script>'} -->

	<!-- Set initial theme to prevent FOUC -->
	<script>
		(function () {
			const savedTheme = localStorage.getItem('theme');
			if (savedTheme) {
				document.documentElement.classList.toggle('dark', savedTheme === 'dark');
			} else {
				const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
				document.documentElement.classList.toggle('dark', prefersDark);
			}
		})();
	</script>

	<!-- Basic SEO -->
	<title>{SeoTitle}</title>
	<meta name="description" content={SeoDescription} />

	<!-- Open Graph -->
	<meta property="og:title" content={SeoTitle} />
	<meta property="og:description" content={SeoDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="/SveltyCMS.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:site_name" content={page.url.origin} />

	<!-- Open Graph : Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={SeoTitle} />
	<meta name="twitter:description" content={SeoDescription} />
	<meta name="twitter:image" content="/SveltyCMS.png" />
	<meta property="twitter:domain" content={page.url.origin} />
	<meta property="twitter:url" content={page.url.href} />
</svelte:head>

{#if loadError}
	<div class="text-error-500">An error occurred: {loadError.message}</div>
{:else if !isCollectionsLoaded}
	<div class="flex h-lvh items-center justify-between lg:justify-start">
		<Loading />
	</div>
{:else if page.url.pathname === '/login'}
	{@render children?.()}
{:else}
	<!-- Body -->
	<div class="flex h-lvh flex-col">
		<!-- Header -->
		{#if uiStateManager.uiState.value.pageheader !== 'hidden'}
			<header class="bg-tertiary-500 sticky top-0 z-10">Header</header>
		{/if}

		<div class="flex flex-1 overflow-hidden">
			<!-- Sidebar Left -->
			{#if uiStateManager.uiState.value.leftSidebar !== 'hidden'}
				<aside
					class="max-h-dvh {uiStateManager.uiState.value.leftSidebar === 'full'
						? 'w-[220px]'
						: 'w-fit'} dark:border-surface-500 dark:from-surface-700 dark:to-surface-950 relative border-r bg-white !px-2 text-center dark:bg-gradient-to-r"
				>
					<LeftSidebar />
				</aside>
			{/if}

			<!-- Content Area -->
			<main class="relative w-full flex-1 overflow-hidden">
				<!-- Page Header -->
				{#if uiStateManager.uiState.value.pageheader !== 'hidden'}
					<header class="sticky top-0 z-10 w-full">
						<HeaderEdit />
					</header>
				{/if}

				<!-- Router Slot -->
				<div
					role="main"
					class="relative h-full flex-grow overflow-auto {uiStateManager.uiState.value.leftSidebar === 'full' ? 'mx-2' : 'mx-1'} {$screenSize === 'lg'
						? 'mb-2'
						: 'mb-16'}"
				>
					{@render children?.()}
					<!-- Modal -->
					<Modal />

					<!-- Floating Nav -->
					{#if $screenSize !== ScreenSize.LG && $screenSize !== ScreenSize.XL}
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
					{:else}
						{@render children?.()}
					{/if}

					{#if isNonCriticalDataLoaded}
						<!-- Non-critical data components -->
					{/if}
				</div>

				<!-- Page Footer -->
				{#if uiStateManager.uiState.value.pagefooter !== 'hidden'}
					<footer
						class="bg-surface-50 dark:border-surface-500 dark:from-surface-700 dark:to-surface-950 sticky top-[calc(100%-51px)] left-0 z-10 w-full border-t bg-gradient-to-b px-1 text-center"
					>
						<PageFooter />
					</footer>
				{/if}
			</main>

			<!-- Sidebar Right -->
			{#if uiStateManager.uiState.value.rightSidebar !== 'hidden'}
				<aside class="bg-surface-50 dark:border-surface-500 dark:from-surface-700 dark:to-surface-950 max-h-dvh w-[220px] border-l bg-gradient-to-r">
					<RightSidebar />
				</aside>
			{/if}
		</div>

		<!-- Footer -->
		{#if uiStateManager.uiState.value.pagefooter !== 'hidden'}
			<footer class="bg-blue-500">Footer</footer>
		{/if}
	</div>
{/if}
