<!--
 @file src/routes/+layout.svelte
 @component
 **This Svelte component serves as the layout for the entire application**

 ### Features
 - Paraglide i18n integration
 - Theme Management
 - Skeleton v4 Toasts & Modals
 -->

<script lang="ts">
	// Selected theme
	import '@shared/theme/app.css';
	// Register Iconify custom element globally
	import 'iconify-icon';

	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';

	// Skeleton v4
	import { app } from '@shared/stores/store.svelte';
	import ToastManager from '@cms/components/system/ToastManager.svelte';
	import DialogManager from '@shared/components/system/DialogManager.svelte';

	// Paraglide locale bridge
	import { locales as availableLocales, getLocale, setLocale } from '@shared/paraglide/runtime';

	// Theme management
	import { themeStore, initializeThemeStore, initializeDarkMode } from '@cms/stores/themeStore.svelte';

	// Global Settings
	import { initPublicEnv, publicEnv } from '@shared/stores/globalSettings.svelte';

	// Stores
	import { ui } from '@cms/stores/UIStore.svelte';
	import { setContentStructure } from '@cms/stores/collectionStore.svelte';

	// Components
	import LeftSidebar from '@cms/components/LeftSidebar.svelte';
	import RightSidebar from '@cms/components/RightSidebar.svelte';
	import HeaderEdit from '@cms/components/HeaderEdit.svelte';

	// Props
	interface Props {
		children?: import('svelte').Snippet;
	}
	const { children }: Props = $props();

	// ============================================================================
	// State Management
	// ============================================================================

	let currentLocale = $state(getLocale());
	let isMounted = $state(false);

	// ============================================================================
	// Initialization
	// ============================================================================

	// Initialize public environment settings from server data
	// Note: Only access page.data after mount to avoid hydration issues
	$effect(() => {
		if (browser && page.data?.settings) {
			initPublicEnv(page.data.settings);
		}
		if (browser && page.data?.navigationStructure) {
			console.log('[Layout] Hydrating contentStructure with', page.data.navigationStructure.length, 'nodes');
			setContentStructure(page.data.navigationStructure);
		} else if (browser) {
			console.log('[Layout] Skipping hydration. Structure missing?', page.data?.navigationStructure);
		}
	});

	// ============================================================================
	// Mount Lifecycle
	// ============================================================================

	onMount(() => {
		console.log('[RootLayout] Mounting in', browser ? 'browser' : 'server');

		// URL is the source of truth on initial load
		const urlLocale = getLocale();
		if (urlLocale && availableLocales.includes(urlLocale as any)) {
			if (app.systemLanguage !== urlLocale) {
				console.log(`[RootLayout] Aligning store (${app.systemLanguage}) to URL (${urlLocale})`);
				app.systemLanguage = urlLocale as any;
				currentLocale = urlLocale;
			}
		}

		// Initialize dark mode
		initializeDarkMode();

		isMounted = true;

		// Check for flash messages (e.g., from login redirect)
		const flashMessageJson = sessionStorage.getItem('flashMessage');
		if (flashMessageJson) {
			try {
				const flashMessage = JSON.parse(flashMessageJson);
				sessionStorage.removeItem('flashMessage');

				// Import toaster dynamically to avoid circular deps (though it's available in stores)
				// We can also import it directly if we want, but dynamic is safer for layout
				import('@shared/stores/store.svelte').then(({ toaster }) => {
					const opts = {
						title: flashMessage.title,
						description: flashMessage.description,
						duration: flashMessage.duration || 4000
					};

					// Small delay to ensure ToastManager is ready
					setTimeout(() => {
						if (flashMessage.type === 'success') {
							toaster.success(opts);
						} else if (flashMessage.type === 'warning') {
							toaster.warning(opts);
						} else if (flashMessage.type === 'error') {
							toaster.error(opts);
						} else {
							toaster.info(opts);
						}
					}, 100);
				});
			} catch (e) {
				console.error('Failed to parse flash message:', e);
				sessionStorage.removeItem('flashMessage');
			}
		}
	});

	// ============================================================================
	// Reactive Locale Syncing
	// ============================================================================

	$effect(() => {
		// Guard: Only sync after mount
		if (!isMounted) return;

		const desired = app.systemLanguage;
		const current = untrack(() => currentLocale);

		// Only update if there's an actual change
		if (desired && availableLocales.includes(desired as any) && current !== desired) {
			console.log('[RootLayout] Store changed, updating locale:', desired);

			// Update Paraglide locale (handles routing internally)
			setLocale(desired as any, { reload: false });
			currentLocale = desired;
		}
	});

	// ============================================================================
	// Theme Auto-Refresh
	// ============================================================================

	$effect(() => {
		if (!themeStore.autoRefreshEnabled || !browser) return;

		const interval = 30 * 60 * 1000; // 30 minutes
		const intervalId = setInterval(() => {
			initializeThemeStore().catch(console.error);
		}, interval);

		return () => clearInterval(intervalId);
	});

	// ============================================================================
	// Derived State
	// ============================================================================

	// Get the site name from publicEnv store (safer for SSR/CSR transitions)
	const siteName = $derived(publicEnv?.SITE_NAME || 'SveltyCMS');

	// Determine if we should show sidebars based on the current route
	// Sidebars are hidden on login and setup pages
	const showSidebars = $derived.by(() => {
		const path = page.url.pathname;
		const isAuthRoute = path.includes('/login') || path.includes('/register');
		const isSetupRoute = path.includes('/setup');
		return !isAuthRoute && !isSetupRoute && isMounted;
	});
</script>

<svelte:head>
	<title>{siteName}</title>
</svelte:head>

{#key currentLocale}
	<ToastManager position="bottom-right" />
	<DialogManager />

	<div class="flex h-screen w-screen overflow-hidden bg-surface-50 dark:bg-surface-900">
		{#if showSidebars && ui.isLeftSidebarVisible}
			<aside
				class="relative h-full border-r border-surface-200 bg-white px-2! text-center transition-all duration-300 dark:border-surface-50 dark:bg-linear-to-r dark:from-surface-700 dark:to-surface-900 {ui
					.state.leftSidebar === 'full'
					? 'w-[220px]'
					: 'w-36'}"
			>
				<LeftSidebar />
			</aside>
		{/if}

		<main class="relative flex h-full flex-1 flex-col overflow-hidden">
			{#if ui.isPageHeaderVisible}
				<HeaderEdit />
			{/if}
			<div class="h-full w-full overflow-auto">
				{@render children?.()}
			</div>
		</main>

		{#if showSidebars && ui.isRightSidebarVisible}
			<aside class="h-full w-60 border-l border-surface-200 bg-white transition-all duration-300 dark:border-surface-50 dark:bg-surface-900">
				<RightSidebar />
			</aside>
		{/if}
	</div>
{/key}
