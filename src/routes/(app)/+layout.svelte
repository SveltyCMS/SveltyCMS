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
	import '../../app.css';

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
	import { screen } from '@stores/screenSizeStore.svelte';
	import { app, toaster } from '@stores/store.svelte';
	import { ui } from '@stores/UIStore.svelte';
	import { widgets } from '@stores/widgetStore.svelte';
	import { initializeDarkMode } from '@stores/themeStore.svelte';

	// Components
	import HeaderEdit from '@components/HeaderEdit.svelte';
	import LeftSidebar from '@components/LeftSidebar.svelte';
	import PageFooter from '@components/PageFooter.svelte';
	import RightSidebar from '@components/RightSidebar.svelte';
	import SearchComponent from '@components/SearchComponent.svelte';
	import FloatingNav from '@components/system/FloatingNav.svelte';
	import DialogManager from '@components/system/DialogManager.svelte';

	// Skeleton v4
	import { Toast } from '@skeletonlabs/skeleton-svelte';

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
	// STATE & DERIVED
	// =============================================

	const { children, data }: Props = $props();

	// Component State
	const loadError = $state<Error | null>(null);

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
		if (!user) {
			app.avatarSrc = '/Default_User.svg';
			return;
		}

		if (user.avatar && user.avatar !== '/Default_User.svg') {
			app.avatarSrc = user.avatar;
		} else {
			app.avatarSrc = '/Default_User.svg';
		}
	}

	// =============================================
	// LIFECYCLE HOOKS
	// =============================================

	onMount(() => {
		if (!Array.isArray(data.contentStructure)) {
			globalLoadingStore.startLoading(loadingOperations.initialization);
		}

		widgets.initialize();
		initializeDarkMode();
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
	<meta name="description" content={seoDescription} />
	<meta property="og:title" content={siteName} />
	<meta property="og:description" content={seoDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="/SveltyCMS.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:site_name" content={page.url.origin} />
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={siteName} />
	<meta name="twitter:description" content={seoDescription} />
	<meta name="twitter:image" content="/SveltyCMS.png" />
	<meta property="twitter:domain" content={page.url.origin} />
	<meta property="twitter:url" content={page.url.href} />
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
		<DialogManager />

		<Toast.Group {toaster}>
			{#snippet children(toast)}
				<Toast
					{toast}
					class="min-w-[300px] max-w-[400px] shadow-lg backdrop-blur-md dark:bg-surface-800/90 bg-white/90 border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden"
				>
					<Toast.Message class="flex flex-col gap-1 p-4 pr-8 relative">
						{#if toast.title}
							<Toast.Title class="font-bold text-base">{toast.title}</Toast.Title>
						{/if}
						<Toast.Description class="text-sm opacity-90">{toast.description}</Toast.Description>
					</Toast.Message>
					<Toast.CloseTrigger
						class="absolute right-2 top-2 p-1.5 hover:bg-surface-500/10 rounded-full transition-colors opacity-60 hover:opacity-100"
					/>
				</Toast>
			{/snippet}
		</Toast.Group>

		{#if screen.isMobile}
			<FloatingNav />
		{/if}

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
						<header class="sticky top-0 z-20 w-full">
							<HeaderEdit />
						</header>
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
	</div>
{/if}
