<!--
 @file src/routes/+layout.svelte
 @component
 **This Svelte component serves as the layout for the entire application**

 ### Features
 - Paraglide i18n integration
 - Theme management
 -->

<script lang="ts">
	import '../app.postcss';
	// Register Iconify custom element globally
	import 'iconify-icon';

	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';

	// Skeleton UI
	import { initializeStores, storePopup, Toast, Modal, getToastStore, getModalStore } from '@skeletonlabs/skeleton';
	import { arrow, autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
	import { setGlobalToastStore } from '@utils/toast';
	import { setGlobalModalStore } from '@utils/modalUtils';

	// Modal Components Registry
	import ScheduleModal from '@components/collectionDisplay/ScheduleModal.svelte';
	import MediaLibraryModal from '@components/MediaLibraryModal.svelte';

	const modalComponentRegistry: Record<string, any> = {
		scheduleModal: ScheduleModal,
		mediaLibraryModal: MediaLibraryModal
	};

	// Paraglide locale bridge
	import { locales as availableLocales, getLocale, setLocale } from '@src/paraglide/runtime';
	import { app } from '@stores/store.svelte';

	// Theme management
	import { themeStore, initializeThemeStore, initializeDarkMode } from '@stores/themeStore.svelte';

	// Global Settings
	import { initPublicEnv } from '@stores/globalSettings.svelte';

	// Components
	import TokenPicker from '@components/TokenPicker.svelte';

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
	let isHydrated = $state(false);
	let toastReady = $state(false);

	// ============================================================================
	// Initialization
	// ============================================================================

	// Initialize Skeleton stores early (idempotent)
	initializeStores();
	storePopup.set({ computePosition, autoUpdate, offset, shift, flip, arrow });
	setGlobalToastStore(getToastStore());
	setGlobalModalStore(getModalStore());

	// Initialize public environment settings from server data
	$effect(() => {
		if (page.data?.settings) {
			initPublicEnv(page.data.settings);
		}
	});

	// ============================================================================
	// Mount Lifecycle
	// ============================================================================

	onMount(() => {
		console.log('[RootLayout] Mounting in', browser ? 'browser' : 'server');

		// Stores are already initialized above; mark toast as ready for client render
		toastReady = true;

		// Wait for hydration to complete before syncing
		requestAnimationFrame(() => {
			isHydrated = true;
			console.log('[RootLayout] Hydration complete');
		});

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
		console.log('[RootLayout] Mount complete');
	});

	// ============================================================================
	// Reactive Locale Syncing
	// ============================================================================

	$effect(() => {
		// Guard: Only sync after hydration is complete
		if (!isMounted || !isHydrated) return;

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

	// Get the site name from data loaded in layout.server.ts
	const siteName = $derived(page.data.settings?.SITE_NAME || 'SveltyCMS');
</script>

<svelte:head>
	<title>{siteName}</title>
</svelte:head>

<div>
	{#key currentLocale}
		{@render children?.()}
	{/key}
	<TokenPicker />
	{#if isMounted}
		<Toast />
		<Modal components={modalComponentRegistry} />
	{/if}
</div>
