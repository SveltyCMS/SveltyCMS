<!--
@file src/routes/(app)/+layout.svelte
@component
**This component renders the main application layout with a persistent state for UI components.**
## Props:
- `theme` {string} - The theme of the website

## Features:
-     Skeleton UI framework for SvelteKit
-     Dynamic theme management based on user preferences or defaults
-     SEO optimization with Open Graph and Twitter Card metadata for enhanced social sharing
-     Initialization of Skeleton stores for UI components
-     Granular loading strategy
-     Asynchronous loading of non-critical data
-->

<script lang="ts">
	// Your selected theme:
	import '../../app.postcss';

	// Icons from https://icon-sets.iconify.design/
	import 'iconify-icon';

	import { page } from '$app/state';
	import { publicEnv } from '@root/config/public';
	import { onDestroy, onMount } from 'svelte';
	// Auth
	import type { User } from '@src/auth/types';

	// Utils
	import { isSearchVisible } from '@utils/globalSearchIndex';
	import { getTextDirection } from '@utils/utils';
	// Stores
	import { collections, contentStructure } from '@stores/collectionStore.svelte';
	import { isMobile, screenSize } from '@stores/screenSizeStore.svelte';
	import { avatarSrc, systemLanguage } from '@stores/store.svelte';
	import { uiStateManager } from '@stores/UIStore.svelte';
	// Components
	import HeaderEdit from '@components/HeaderEdit.svelte';
	import LeftSidebar from '@components/LeftSidebar.svelte';
	import Loading from '@components/Loading.svelte';
	import PageFooter from '@components/PageFooter.svelte';
	import RightSidebar from '@components/RightSidebar.svelte';
	import SearchComponent from '@components/SearchComponent.svelte';
	import FloatingNav from '@components/system/FloatingNav.svelte';
	// Skeleton
	import { Modal, setInitialClassState, setModeCurrent, setModeUserPrefers, Toast } from '@skeletonlabs/skeleton';
	// Required for popups to function
	import { arrow, autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
	import type { ContentNode } from '@root/src/databases/dbInterface';
	import { storePopup } from '@skeletonlabs/skeleton';

	storePopup.set({ computePosition, autoUpdate, offset, shift, flip, arrow });

	interface Props {
		children?: import('svelte').Snippet;
		data: {
			user: User;
			contentStructure: ContentNode[];
			contentLanguage: string;
			systemLanguage: string;
		};
	}

	let { children, data }: Props = $props();

	// State variables
	let isLoading = $state(true);
	let isCollectionsLoaded = $state(false);
	let isNonCriticalDataLoaded = $state(false);
	let loadError = $state<Error | null>(null);
	let mediaQuery: MediaQueryList;

	// Update collection loaded state when contentStructure or collections change
	$effect(() => {
		// Check if we have contentStructure data OR collections data
		const hasContentStructure = contentStructure.value && contentStructure.value.length > 0;
		const hasCollections = collections.value && Object.keys(collections.value).length > 0;

		if (hasContentStructure || hasCollections) {
			isCollectionsLoaded = true;
			isLoading = false;
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
			//console.log('contentStructure', data.contentStructure);
			contentStructure.set(data.contentStructure);
			isCollectionsLoaded = true;
			isLoading = false;
		} catch (error) {
			console.error('Error loading collections:', error);
			loadError = error instanceof Error ? error : new Error('Unknown error occurred while loading collections');
			isLoading = false; // Stop loading even if there's an error
		}
	}

	// Function to load non-critical data
	async function loadNonCriticalData() {
		await new Promise((resolve) => setTimeout(resolve, 2000));
		isNonCriticalDataLoaded = true;
	}

	// Theme management
	function updateThemeBasedOnSystemPreference(event: MediaQueryListEvent) {
		const prefersDarkMode = event.matches;
		setModeUserPrefers(prefersDarkMode);
		setModeCurrent(prefersDarkMode);
		localStorage.setItem('theme', prefersDarkMode ? 'dark' : 'light');
	}

	// Keyboard shortcuts
	function onKeyDown(event: KeyboardEvent) {
		if (event.altKey && event.key === 's') {
			event.preventDefault();
			isSearchVisible.update((v) => !v);
		}
	}

	onMount(() => {
		// Theme initialization
		mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		mediaQuery.addEventListener('change', updateThemeBasedOnSystemPreference);

		// Check for saved theme preference in localStorage
		const savedTheme = localStorage.getItem('theme');
		if (savedTheme) {
			const newMode = savedTheme === 'light';
			setModeUserPrefers(newMode);
			setModeCurrent(newMode);
		}

		if (data.user) {
			// Initialize avatar with user's avatar URL from database, fallback to default
			if (data.user.avatar && data.user.avatar !== '/Default_User.svg') {
				avatarSrc.set(data.user.avatar);
			} else {
				avatarSrc.set('/Default_User.svg');
			}
		}

		// Event listeners
		window.addEventListener('keydown', onKeyDown);

		// Initialize data
		initializeCollections();
		loadNonCriticalData();
	});

	onDestroy(() => {
		// Cleanup: remove event listeners
		mediaQuery?.removeEventListener('change', updateThemeBasedOnSystemPreference);
		window.removeEventListener('keydown', onKeyDown);
	});

	// SEO
	const SeoTitle = `${publicEnv.SITE_NAME} - powered with sveltekit`;
	const SeoDescription = `${publicEnv.SITE_NAME} - a modern, powerful, and easy-to-use CMS powered by SvelteKit. Manage your content with ease & take advantage of the latest web technologies.`;
</script>

<svelte:head>
	<!-- Dark Mode -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags-->
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
	<meta property="og:site_name" content={page.url.origin} />

	<!-- Open Graph : Twitter-->
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
	<div class="flex h-lvh items-center justify-center"><Loading /></div>
{:else}
	<!-- This outer div is a good container for overlays -->
	<div class="relative h-lvh w-full">
		<!-- Background and Overlay components live here, outside the main content flow -->
		{#if $isMobile}
			<FloatingNav />
		{/if}
		<Toast />
		<Modal />
		{#if $isSearchVisible}
			<SearchComponent />
		{/if}

		<!-- Body -->
		<div class="flex h-lvh flex-col overflow-hidden">
			<!-- Header (unused) -->
			{#if uiStateManager.uiState.value.header !== 'hidden'}
				<header class="sticky top-0 z-10 bg-tertiary-500">Header</header>
			{/if}

			<div class="flex flex-1 overflow-hidden">
				<!-- Sidebar Left -->
				{#if uiStateManager.uiState.value.leftSidebar !== 'hidden'}
					<aside
						class="max-h-dvh {uiStateManager.uiState.value.leftSidebar === 'full'
							? 'w-[220px]'
							: 'w-fit'} relative z-10 border-r bg-white !px-2 text-center dark:border-surface-500 dark:bg-gradient-to-r dark:from-surface-700 dark:to-surface-900"
					>
						<LeftSidebar />
					</aside>
				{/if}

				<!-- Content Area -->
				<main class="relative z-0 w-full min-w-0 flex-1 overflow-y-auto">
					<!-- Page Header -->
					{#if uiStateManager.uiState.value.pageheader !== 'hidden'}
						<header class="sticky top-0 z-10 w-full"><HeaderEdit /></header>
					{/if}

					<!-- Router Slot -->
					<div
						role="main"
						class="relative flex-grow {uiStateManager.uiState.value.leftSidebar === 'full' ? 'mx-2' : 'mx-1'} {$screenSize === 'LG'
							? 'mb-2'
							: 'mb-16'}"
					>
						{#if isLoading}
							<div class="flex h-screen items-center justify-center"><Loading /></div>
						{:else}
							{@render children?.()}
						{/if}
					</div>

					<!-- Page Footer (Mobile Nav) -->
					{#if uiStateManager.uiState.value.pagefooter !== 'hidden'}
						<footer class="sticky bottom-0 z-20 w-full bg-surface-50 bg-gradient-to-b px-1 text-center dark:from-surface-700 dark:to-surface-900">
							<PageFooter />
						</footer>
					{/if}
				</main>

				<!-- Sidebar Right -->
				{#if uiStateManager.uiState.value.rightSidebar !== 'hidden'}
					<aside
						class="z-10 max-h-dvh w-[220px] border-l bg-surface-50 bg-gradient-to-r dark:border-surface-500 dark:from-surface-700 dark:to-surface-900"
					>
						<RightSidebar />
					</aside>
				{/if}
			</div>

			<!-- Footer (unused) -->
			{#if uiStateManager.uiState.value.footer !== 'hidden'}
				<footer class="bg-blue-500">Footer</footer>
			{/if}
		</div>
	</div>
{/if}
