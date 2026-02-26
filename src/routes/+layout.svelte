<!-- @file src/routes/+layout.svelte @description Global layout component with theme, i18n, and UI managers features: [Paraglide i18n integration, Theme Management, Skeleton v4 Toasts & Modals, WebMCP Support, Flash Messaging] -->

<script lang="ts">
	// Selected theme
	import '../app.css';
	// Register Iconify custom element globally
	import 'iconify-icon';

	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';

	// WebMCP Support (Polyfill + Plugin)
	import '@mcp-b/global';
	import { Portal } from '@skeletonlabs/skeleton-svelte';
	// Components
	import DialogManager from '@src/components/system/dialog-manager.svelte';
	import FloatingNav from '@src/components/system/floating-nav.svelte';
	import ToastManager from '@src/components/system/toast-manager.svelte';
	// Paraglide locale bridge
	import { locales as availableLocales, getLocale, setLocale } from '@src/paraglide/runtime';
	import CookieConsent from '@src/plugins/cookie-consent/cookie-consent.svelte';
	import { initWebMCP } from '@src/plugins/webmcp/index';
	// Global Settings
	import { initPublicEnv, publicEnv } from '@src/stores/global-settings.svelte';
	// Stores
	import { screen as screenSize } from '@src/stores/screen-size-store.svelte.ts';
	// Skeleton v4
	import { app, toaster } from '@src/stores/store.svelte';
	// Theme management
	import { initializeDarkMode, initializeThemeStore, themeStore } from '@src/stores/theme-store.svelte';

	// Components
	// import TokenPicker from '@components/token-picker.svelte';

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

	import { setContentStructure } from '@src/stores/collection-store.svelte';

	// Initialize public environment settings from server data
	// Note: Only access page.data after mount to avoid hydration issues
	$effect(() => {
		if (browser && page.data) {
			if (page.data.settings) {
				initPublicEnv(page.data.settings);
			}
			if (page.data.navigationStructure) {
				setContentStructure(page.data.navigationStructure);
			}
		}
	});

	// ============================================================================
	// Mount Lifecycle
	// ============================================================================

	onMount(() => {
		console.log('[RootLayout] Mounting in', browser ? 'browser' : 'server');

		// URL is the source of truth on initial load
		const urlLocale = getLocale();
		if (urlLocale && availableLocales.includes(urlLocale as any) && app.systemLanguage !== urlLocale) {
			console.log(`[RootLayout] Aligning store (${app.systemLanguage}) to URL (${urlLocale})`);
			app.systemLanguage = urlLocale as any;
			currentLocale = urlLocale;
		}

		// Initialize dark mode
		initializeDarkMode();

		// Initialize WebMCP (Client-side AI Tools)
		if (browser) {
			// Tiny delay to ensure polyfill overrides are settled
			setTimeout(() => {
				initWebMCP().catch(console.error);
			}, 100);
		}

		isMounted = true;
	});

	/**
	 * Reactive Flash Message Detection
	 * Watches for URL changes and triggers toaster's flash message processor.
	 */
	$effect(() => {
		if (!(browser && isMounted)) {
			return;
		}

		// Depend on page.url to trigger this effect on every navigation
		void page.url.pathname;

		// Delegate to toaster store
		toaster.checkFlash();
	});

	// ============================================================================
	// Reactive Locale Syncing
	// ============================================================================

	$effect(() => {
		// Guard: Only sync after mount
		if (!isMounted) {
			return;
		}

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
		if (!(themeStore.autoRefreshEnabled && browser)) {
			return;
		}

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

	// Global Keyboard Shortcuts
	onMount(() => {
		if (!browser) {
			return;
		}

		const controller = new AbortController();

		(async () => {
			try {
				const ACCESSIBILITY_HELP = (await import('@components/system/accessibility-help.svelte')).default;
				const { modalState } = await import('@utils/modal-state.svelte');

				if (controller.signal.aborted) {
					return;
				}

				function handleGlobalKeydown(e: KeyboardEvent) {
					// '?' key (Shift + /) to open accessibility help
					if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
						// Avoid triggering if user is typing in an input/textarea
						const target = e.target as HTMLElement;
						if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
							return;
						}

						e.preventDefault();
						modalState.trigger(ACCESSIBILITY_HELP, {
							ariaLabel: 'Accessibility Help'
						});
					}

					// 'Alt + T' to toggle theme
					if (e.altKey && e.key.toLowerCase() === 't') {
						e.preventDefault();
						// Based on themeStore.svelte.ts, the function is toggleDarkMode
						import('@src/stores/theme-store.svelte').then(({ toggleDarkMode }) => {
							toggleDarkMode();
						});
					}
				}

				window.addEventListener('keydown', handleGlobalKeydown);
				controller.signal.addEventListener('abort', () => {
					window.removeEventListener('keydown', handleGlobalKeydown);
				});
			} catch (err) {
				console.error('Failed to setup global keyboard shortcuts:', err);
			}
		})();

		return () => controller.abort();
	});
</script>

<svelte:head><title>{siteName}</title></svelte:head>

<DialogManager />
<Portal><ToastManager position="bottom-center" /></Portal>

{#key currentLocale}
	{#if screenSize.isMobile && !page.url.pathname.includes('/setup')}
		<Portal><FloatingNav /></Portal>
	{/if}

	{@render children?.()}
{/key}

<CookieConsent />
