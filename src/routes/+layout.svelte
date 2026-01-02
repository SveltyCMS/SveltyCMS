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
	import '../app.css';
	// Register Iconify custom element globally
	import 'iconify-icon';

	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';

	// Skeleton v4
	import { toaster, app } from '@stores/store.svelte';
	import { Toast } from '@skeletonlabs/skeleton-svelte';
	// import DialogManager from '@components/system/DialogManager.svelte';

	// Paraglide locale bridge
	import { locales as availableLocales, getLocale, setLocale } from '@src/paraglide/runtime';

	// Theme management
	import { themeStore, initializeThemeStore, initializeDarkMode } from '@stores/themeStore.svelte';

	// Global Settings
	import { initPublicEnv, publicEnv } from '@stores/globalSettings.svelte';

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
	<Toast.Group {toaster}>
		{#snippet children(toast)}
			<Toast {toast} class="card w-[300px] shadow-xl p-4 space-y-2 bg-surface-100-900 border border-surface-200-800 rounded-lg">
				{#if toast.title}
					<Toast.Title class="h6 font-bold">{toast.title}</Toast.Title>
				{/if}
				<Toast.Description class="text-sm">{toast.description}</Toast.Description>
				<Toast.CloseTrigger class="absolute right-2 top-2 btn-icon btn-sm" />
			</Toast>
		{/snippet}
	</Toast.Group>

	{@render children?.()}
{/key}
