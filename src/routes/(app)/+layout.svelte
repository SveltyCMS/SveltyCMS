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
	import FloatingChat from '@components/collaboration/FloatingChat.svelte';
	// Components
	import HeaderEdit from '@components/HeaderEdit.svelte';
	import LeftSidebar from '@components/LeftSidebar.svelte';
	import PageFooter from '@components/PageFooter.svelte';
	import RightSidebar from '@components/RightSidebar.svelte';
	import SearchComponent from '@components/SearchComponent.svelte';
	// Type Imports
	import type { User } from '@src/databases/auth/types';

	// Stores
	// Stores
	import { setCollection, setContentStructure } from '@stores/collectionStore.svelte.ts';
	import { publicEnv } from '@stores/globalSettings.svelte.ts';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte.ts';
	import { screen } from '@stores/screenSizeStore.svelte.ts';
	import { app } from '@stores/store.svelte';
	import { initializeDarkMode } from '@stores/themeStore.svelte.ts';
	import { ui } from '@stores/UIStore.svelte.ts';
	import { widgets } from '@stores/widgetStore.svelte.ts';
	// Utils
	import { isSearchVisible } from '@utils/globalSearchIndex';
	import { getTextDirection } from '@utils/utils';
	import { onDestroy, onMount } from 'svelte';
	// SvelteKit Navigation
	import { afterNavigate, beforeNavigate } from '$app/navigation';
	import { page } from '$app/state';
	import type { ContentNode, Schema } from '../../content/types';

	// =============================================
	// TYPE DEFINITIONS
	// =============================================

	interface LayoutData {
		contentStructure: ContentNode[] | Promise<ContentNode[]>;
		firstCollection?: Schema | null | Promise<Schema | null>;
		nonce: string;
		publicSettings?: Record<string, any>;
		theme?: string;
		user: User | null;
	}

	interface Props {
		children?: import('svelte').Snippet;
		data: LayoutData;
	}

	// =============================================
	// STATE & DERIVED
	// =============================================

	const { children, data }: Props = $props();

	// Component State
	let loadError = $state<Error | null>(null);

	// =============================================
	// DERIVED STATE
	// =============================================

	// SEO meta content
	const siteName = publicEnv?.SITE_NAME || 'SveltyCMS';
	const seoDescription = `${siteName} - a modern, powerful, and easy-to-use CMS powered by SvelteKit. Manage your content with ease & take advantage of the latest web technologies.`;

	// =============================================
	// REACTIVE EFFECTS
	// =============================================

	// Initialization loader is now managed in the data sync effect below

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

		// Handle streaming promises or direct data
		Promise.resolve(data.contentStructure)
			.then((structure) => {
				if (Array.isArray(structure)) {
					defer(() => {
						setContentStructure(structure);
						globalLoadingStore.stopLoading(loadingOperations.initialization);
					});
				}
			})
			.catch((err) => {
				console.error('Failed to load content structure', err);
				loadError = err;
			});

		// Hydrate first collection if available and no collection is currently set
		Promise.resolve(data.firstCollection).then((first) => {
			if (first !== undefined && first !== null) {
				defer(() => setCollection(first));
			}
		});
	});

	// Effect: Handle system language changes
	$effect(() => {
		const lang = app.systemLanguage;
		if (!lang) return;

		const dir = getTextDirection(lang);
		if (!dir) return;

		document.documentElement.dir = dir;
		document.documentElement.lang = lang;
	});

	// =============================================
	// EVENT HANDLERS
	// =============================================

	// Global keyboard shortcuts handler
	function handleKeyDown(event: KeyboardEvent): void {
		if (event.altKey && event.key === 's') {
			event.preventDefault();
			isSearchVisible.update((visible) => !visible);
		}
	}

	// Initialize avatar from user data
	function initializeUserAvatar(user: User | null): void {
		console.log('[AppLayout] initializeUserAvatar for user:', user?.username || 'Guest');
		if (!user) {
			app.avatarSrc = '/Default_User.svg';
			return;
		}

		if (user.avatar && user.avatar !== '/Default_User.svg') {
			app.avatarSrc = user.avatar;
		} else {
			app.avatarSrc = '/Default_User.svg';
		}
		console.log('[AppLayout] Avatar source set to:', app.avatarSrc);
	}

	// =============================================
	// LIFECYCLE HOOKS
	// =============================================

	onMount(() => {
		console.log('[AppLayout] Mounted. User:', data.user?.username || 'None');

		// Start loading if content structure isn't ready yet
		Promise.resolve(data.contentStructure).then((_) => {
			// Already handled in effect, but if we wanted to check initial state:
			// If it resolves immediately, we're good.
		});

		// Always ensure loading is started if we don't have data yet.
		// Since we are streaming, we assume it's loading effectively.
		// We rely on the effect to clear it.
		globalLoadingStore.startLoading(loadingOperations.initialization);

		widgets.initialize();
		initializeDarkMode(data.theme as any);
		initializeUserAvatar(data.user);
		window.addEventListener('keydown', handleKeyDown);
	});

	beforeNavigate(({ from, to }) => {
		if (from && to && from.route.id !== to.route.id) {
			globalLoadingStore.startLoading(loadingOperations.navigation);
		}
	});

	afterNavigate(() => {
		globalLoadingStore.stopLoading(loadingOperations.navigation);
		setTimeout(() => {
			if (globalLoadingStore.loadingStack.size === 1 && globalLoadingStore.isLoadingReason(loadingOperations.navigation)) {
				globalLoadingStore.stopLoading(loadingOperations.navigation);
			}
		}, 100);
	});

	onDestroy(() => {
		window.removeEventListener('keydown', handleKeyDown);
	});
</script>

<svelte:head>
	<meta name="description" content={seoDescription}>
	<meta property="og:title" content={siteName}>
	<meta property="og:description" content={seoDescription}>
	<meta property="og:type" content="website">
	<meta property="og:image" content="/SveltyCMS.png">
	<meta property="og:image:width" content="1200">
	<meta property="og:image:height" content="630">
	<meta property="og:site_name" content={page.url.origin}>
	<meta name="twitter:card" content="summary_large_image">
	<meta name="twitter:title" content={siteName}>
	<meta name="twitter:description" content={seoDescription}>
	<meta name="twitter:image" content="/SveltyCMS.png">
	<meta property="twitter:domain" content={page.url.origin}>
	<meta property="twitter:url" content={page.url.href}>
</svelte:head>

{#if loadError}
	<div class="flex h-screen w-screen items-center justify-center bg-error-50 dark:bg-error-900">
		<div class="text-center">
			<h1 class="text-2xl font-bold text-error-600 dark:text-error-300">Application Error</h1>
			<p class="mt-2 text-error-500 dark:text-error-400">{loadError.message}</p>
		</div>
	</div>
{:else}
	<div class="relative h-lvh w-full">
		{#if $isSearchVisible}
			<SearchComponent />
		{/if}

		<div class="flex h-lvh flex-col overflow-hidden">
			{#if ui.state.header !== 'hidden'}
				<header class="sticky top-0 z-10 bg-tertiary-500"></header>
			{/if}

			<div class="flex flex-1 overflow-hidden">
				{#if ui.state.leftSidebar !== 'hidden'}
					<aside
						class="max-h-dvh {ui.state.leftSidebar === 'full'
							? 'w-[220px]'
							: 'w-fit'} relative border-r bg-white px-2! text-center dark:border-surface-500 dark:bg-linear-to-r dark:from-surface-700 dark:to-surface-900"
						aria-label="Left sidebar navigation"
					>
						<LeftSidebar />
					</aside>
				{/if}

				<main class="relative z-0 flex w-full min-w-0 flex-1 flex-col">
					{#if ui.state.pageheader !== 'hidden'}
						<header class="sticky top-0 z-20 w-full"><HeaderEdit /></header>
					{/if}

					<div class="relative flex-1 overflow-visible {ui.state.leftSidebar === 'full' ? 'mx-2' : 'mx-1'} {screen.isDesktop ? 'mb-2' : 'mb-16'}">
						{@render children?.()}
					</div>

					{#if ui.state.pagefooter !== 'hidden'}
						<footer class="mt-auto w-full bg-surface-50 bg-linear-to-b px-1 text-center dark:from-surface-700 dark:to-surface-900">
							<PageFooter />
						</footer>
					{/if}
				</main>

				{#if ui.state.rightSidebar !== 'hidden'}
					<aside
						class="max-h-dvh w-[220px] border-l bg-white bg-linear-to-r dark:border-surface-500 dark:from-surface-700 dark:to-surface-900"
						aria-label="Right sidebar"
					>
						<RightSidebar />
					</aside>
				{/if}
			</div>

			{#if ui.state.footer !== 'hidden'}
				<footer class="bg-blue-500"></footer>
			{/if}
		</div>

		{#if data.user}
			<FloatingChat />
		{/if}
	</div>
{/if}
