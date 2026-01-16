<!--
@file src/routes/(app)/+layout.svelte
@component Main application layout with comprehensive state management

## Features
- Type-safe props and state management
- Centralized theme initialization and management
- Performance-optimized loading states with granular control
- Accessibility-compliant keyboard shortcuts
- SEO optimization with dynamic meta tags
- Modular component architecture
- Memory leak prevention with proper cleanup
- Content structure synchronization
- Restart polling for dev/production hot-reload notifications
- CSP-compliant nonce handling for inline scripts

## Architecture
- Separation of concerns: UI state, loading state, theme state
- Reactive data synchronization with microtask deferral
- Event listener lifecycle management
- Progressive enhancement strategy

## Props
@prop {Snippet} children - Page content slot
@prop {LayoutData} data - Server-provided data (user, contentStructure, nonce)
-->

<script lang="ts">
	// Selected theme:
	import '@src/app.css';

	// Icons from https://icon-sets.iconify.design/
	import 'iconify-icon';

	// SvelteKit Navigation
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, onMount } from 'svelte';

	// Type Imports
	import type { User } from '@src/databases/auth/types';
	import type { ContentNode, Schema } from '../../content/types';

	// Utils
	import { isSearchVisible } from '@utils/globalSearchIndex';
	import { getTextDirection } from '@utils/utils';

	// Stores
	import { setContentStructure, setCollection } from '@stores/collectionStore.svelte';
	import { publicEnv } from '@stores/globalSettings.svelte';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';
	import { isDesktop, screenSize } from '@stores/screenSizeStore.svelte';
	import { avatarSrc, systemLanguage } from '@stores/store.svelte';
	import { uiStateManager } from '@stores/UIStore.svelte';
	import { widgetStoreActions } from '@stores/widgetStore.svelte';
	import { initializeDarkMode } from '@stores/themeStore.svelte';

	// Components
	import HeaderEdit from '@components/HeaderEdit.svelte';
	import LeftSidebar from '@components/LeftSidebar.svelte';
	import PageFooter from '@components/PageFooter.svelte';
	import RightSidebar from '@components/RightSidebar.svelte';
	import SearchComponent from '@components/SearchComponent.svelte';
	import FloatingNav from '@components/system/FloatingNav.svelte';

	// Dark mode handled by custom themeStore (initializeDarkMode)

	// =============================================
	// TYPE DEFINITIONS
	// =============================================

	interface LayoutData {
		user: User | null;
		contentStructure: ContentNode[];
		nonce: string;
		publicSettings?: Record<string, any>;
		theme?: string;
		firstCollection?: Schema | null;
	}

	interface Props {
		children?: import('svelte').Snippet;
		data: LayoutData;
	}

	// =============================================
	// PROPS & STATE
	// =============================================

	const { children, data }: Props = $props();

	// setGlobalToastStore(getToastStore());

	// Component State
	const loadError = $state<Error | null>(null);
	let mediaQuery: MediaQueryList | undefined;

	// =============================================
	// DERIVED STATE
	// =============================================

	// SEO meta content
	const siteName = publicEnv?.SITE_NAME || 'SveltyCMS';
	const seoDescription = `${siteName} - a modern, powerful, and easy-to-use CMS powered by SvelteKit. Manage your content with ease & take advantage of the latest web technologies.`;

	// =============================================
	// REACTIVE EFFECTS
	// =============================================

	// Effect: Stop initialization loader once content structure is received
	$effect(() => {
		if (Array.isArray(data.contentStructure)) {
			globalLoadingStore.stopLoading(loadingOperations.initialization);
		}
	});

	// Effect: Synchronize content structure with store
	$effect(() => {
		// Defer store updates to next microtask to prevent UpdatedAtError
		const defer = (fn: () => void): void => {
			if (typeof queueMicrotask === 'function') {
				queueMicrotask(fn);
			} else {
				Promise.resolve().then(fn);
			}
		};

		if (Array.isArray(data.contentStructure)) {
			defer(() => setContentStructure(data.contentStructure));
		}

		// Hydrate first collection if available and no collection is currently set
		if (data.firstCollection !== undefined) {
			defer(() => setCollection(data.firstCollection ?? null));
		}
	});

	// Effect: Handle system language changes
	$effect(() => {
		const lang = systemLanguage.value;
		if (!lang) return;

		const dir = getTextDirection(lang);
		if (!dir) return;

		document.documentElement.dir = dir;
		document.documentElement.lang = lang;
	});

	// =============================================
	// EVENT HANDLERS
	// =============================================

	/**
	 * Updates theme based on OS preference changes
	 * Only applies if user hasn't set an explicit preference
	 */
	function handleSystemThemeChange(event: MediaQueryListEvent): void {
		// Only update if user hasn't set an explicit preference
		const userHasPreference = document.cookie.includes('theme=');

		if (!userHasPreference) {
			const prefersDarkMode = event.matches;
			// Apply theme to DOM
			if (prefersDarkMode) {
				document.documentElement.classList.add('dark');
			} else {
				document.documentElement.classList.remove('dark');
			}
		}
	}

	// Global keyboard shortcuts handler
	function handleKeyDown(event: KeyboardEvent): void {
		// Alt+S: Toggle search
		if (event.altKey && event.key === 's') {
			event.preventDefault();
			isSearchVisible.update((visible) => !visible);
		}
	}

	// Initialize avatar from user data
	function initializeUserAvatar(user: User | null): void {
		if (!user) {
			avatarSrc.value = '/Default_User.svg';
			return;
		}

		if (user.avatar && user.avatar !== '/Default_User.svg') {
			avatarSrc.value = user.avatar;
		} else {
			avatarSrc.value = '/Default_User.svg';
		}
	}

	// =============================================
	// LIFECYCLE HOOKS
	// =============================================

	onMount(() => {
		// Start initialization loading ONLY if content structure is missing
		// This prevents a race condition where onMount (running after effect) restarts loading
		if (!Array.isArray(data.contentStructure)) {
			globalLoadingStore.startLoading(loadingOperations.initialization);
		}

		// Initialize widgets
		widgetStoreActions.initializeWidgets();

		// Initialize theme from cookie/system preference
		initializeDarkMode();

		// Set up system theme preference listener
		mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
		mediaQuery.addEventListener('change', handleSystemThemeChange);

		// Initialize user avatar
		initializeUserAvatar(data.user);

		// Register global keyboard shortcuts
		window.addEventListener('keydown', handleKeyDown);
	});

	// Navigation loading handlers
	beforeNavigate(({ from, to }) => {
		// Only show loading for actual page changes, not hash changes
		if (from && to && from.route.id !== to.route.id) {
			globalLoadingStore.startLoading(loadingOperations.navigation);
		}
	});

	afterNavigate(() => {
		// Stop navigation loading
		globalLoadingStore.stopLoading(loadingOperations.navigation);

		// Clear stale loading operations after navigation
		setTimeout(() => {
			// Only clear if no other operations are running
			if (globalLoadingStore.loadingStack.size === 1 && globalLoadingStore.isLoadingReason(loadingOperations.navigation)) {
				globalLoadingStore.stopLoading(loadingOperations.navigation);
			}
		}, 100);
	});

	onDestroy(() => {
		// Cleanup: remove event listeners
		mediaQuery?.removeEventListener('change', handleSystemThemeChange);
		window.removeEventListener('keydown', handleKeyDown);
	});
</script>

<!-- HEAD: SEO & THEME INITIALIZATION -->

<svelte:head>
	<!-- Dark Mode Initialization (CSP-compliant with nonce) -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	<!-- Dark mode initialization handled by themeStore -->

	<!-- Basic SEO -->
	<meta name="description" content={seoDescription} />

	<!-- Open Graph -->
	<meta property="og:title" content={siteName} />
	<meta property="og:description" content={seoDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="/SveltyCMS.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:site_name" content={page.url.origin} />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={siteName} />
	<meta name="twitter:description" content={seoDescription} />
	<meta name="twitter:image" content="/SveltyCMS.png" />
	<meta property="twitter:domain" content={page.url.origin} />
	<meta property="twitter:url" content={page.url.href} />
</svelte:head>

<!-- MAIN LAYOUT -->

{#if loadError}
	<!-- Error State -->
	<div class="flex h-screen w-screen items-center justify-center bg-error-50 dark:bg-error-900">
		<div class="text-center">
			<h1 class="text-2xl font-bold text-error-600 dark:text-error-300">Application Error</h1>
			<p class="mt-2 text-error-500 dark:text-error-400">{loadError.message}</p>
		</div>
	</div>
{:else}
	<!-- Application Container -->
	<div class="relative h-lvh w-full">
		<!-- Overlays: Mobile Nav, Toasts, Modals, Search -->
		{#if screenSize.value === 'XS' || screenSize.value === 'SM'}
			<FloatingNav />
		{/if}

		{#if $isSearchVisible}
			<SearchComponent />
		{/if}

		<!-- Main Layout Structure -->
		<div class="flex h-lvh flex-col overflow-hidden">
			<!-- Header (Optional) -->
			{#if uiStateManager.uiState.value.header !== 'hidden'}
				<header class="sticky top-0 z-10 bg-tertiary-500">
					<!-- Header content goes here -->
				</header>
			{/if}

			<!-- Body: Sidebars + Main Content -->
			<div class="flex flex-1 overflow-hidden">
				<!-- Left Sidebar -->
				{#if uiStateManager.uiState.value.leftSidebar !== 'hidden'}
					<aside
						class="max-h-dvh {uiStateManager.uiState.value.leftSidebar === 'full'
							? 'w-[220px]'
							: 'w-fit'} relative border-r bg-white px-2! text-center dark:border-surface-500 dark:bg-linear-to-r dark:from-preset-700 dark:to-preset-900"
						aria-label="Left sidebar navigation"
					>
						<LeftSidebar />
					</aside>
				{/if}

				<!-- Main Content Area -->
				<main class="relative z-0 flex w-full min-w-0 flex-1 flex-col">
					<!-- Page Header -->
					{#if uiStateManager.uiState.value.pageheader !== 'hidden'}
						<header class="sticky top-0 z-20 w-full">
							<HeaderEdit />
						</header>
					{/if}

					<!-- Router Slot -->
					<div
						class="relative flex-1 overflow-visible {uiStateManager.uiState.value.leftSidebar === 'full' ? 'mx-2' : 'mx-1'} {isDesktop.value
							? 'mb-2'
							: 'mb-16'}"
					>
						<!-- Page Content Slot -->
						{@render children?.()}
					</div>

					<!-- Page Footer / Mobile Nav -->
					{#if uiStateManager.uiState.value.pagefooter !== 'hidden'}
						<footer class="mt-auto w-full bg-surface-50 bg-linear-to-b px-1 text-center dark:from-preset-700 dark:to-preset-900">
							<PageFooter />
						</footer>
					{/if}
				</main>

				<!-- Right Sidebar -->
				{#if uiStateManager.uiState.value.rightSidebar !== 'hidden'}
					<aside
						class="max-h-dvh w-[220px] border-l bg-white bg-linear-to-r dark:border-surface-500 dark:from-preset-700 dark:to-preset-900"
						aria-label="Right sidebar"
					>
						<RightSidebar />
					</aside>
				{/if}
			</div>

			<!-- Footer (Optional) -->
			{#if uiStateManager.uiState.value.footer !== 'hidden'}
				<footer class="bg-tertiary-500">
					<!-- Footer content goes here -->
				</footer>
			{/if}
		</div>
	</div>
{/if}
