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
	import Settings from '@lucide/svelte/icons/settings';

	// Selected theme
	import '../app.css';

	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';

	// Skeleton v4
	import { app } from '@stores/store.svelte';
	import ToastManager from '@components/system/ToastManager.svelte';
	// import DialogManager from '@components/system/DialogManager.svelte';

	// Paraglide locale bridge
	import { locales as availableLocales, getLocale, setLocale } from '@src/paraglide/runtime';

	// Theme management
	import { themeStore, initializeThemeStore, initializeDarkMode } from '@stores/themeStore.svelte.ts';

	// Global Settings
	import { initPublicEnv, publicEnv } from '@stores/globalSettings.svelte.ts';

	// Components
	// import TokenPicker from '@components/TokenPicker.svelte';

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
				import('@stores/store.svelte.ts').then(({ toaster }) => {
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
</script>

<svelte:head>
	<title>{siteName}</title>
</svelte:head>

{#key currentLocale}
	<!-- <DialogManager /> -->
	<ToastManager position="bottom-right" />

	{@render children?.()}
{/key}
