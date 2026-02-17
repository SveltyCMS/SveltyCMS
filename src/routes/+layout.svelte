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

	import { onMount, untrack } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';

	// WebMCP Support (Polyfill + Plugin)
	import '@mcp-b/global/dist/polyfill.js';
	import DialogManager from '@components/system/DialogManager.svelte';
	import FloatingNav from '@components/system/FloatingNav.svelte';
	import ToastManager from '@components/system/ToastManager.svelte';
	import { Portal } from '@skeletonlabs/skeleton-svelte';
	// Paraglide locale bridge
	import { locales as availableLocales, getLocale, setLocale } from '@src/paraglide/runtime';
	import CookieConsent from '@src/plugins/cookie-consent/CookieConsent.svelte';
	import { initWebMCP } from '@src/plugins/webmcp/index';
	// Global Settings
	import { initPublicEnv, publicEnv } from '@stores/globalSettings.svelte';
	import { screen } from '@stores/screenSizeStore.svelte.ts';
	// Skeleton v4
	import { app, toaster } from '@stores/store.svelte';
	// Theme management
	import { initializeDarkMode, initializeThemeStore, themeStore } from '@stores/themeStore.svelte';

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

	import { setContentStructure } from '@stores/collectionStore.svelte';

	// Initialize public environment settings from server data
	// Note: Only access page.data after mount to avoid hydration issues
	$effect(() => {
		if (browser && page.data) {
			if (page.data.settings) initPublicEnv(page.data.settings);
			if (page.data.navigationStructure) setContentStructure(page.data.navigationStructure);
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
	 * Watches for URL changes and checks sessionStorage for "flashMessage"
	 * This ensures toasts appear correctly even during SPA navigation (goto).
	 */
	$effect(() => {
		if (!(browser && isMounted)) return;

		// Depend on page.url to trigger this effect on every navigation
		void page.url.pathname;

		const flashMessageJson = sessionStorage.getItem('flashMessage');
		if (flashMessageJson) {
			console.log('[RootLayout] Flash message detected:', flashMessageJson);
			try {
				const flashMessage = JSON.parse(flashMessageJson);
				console.log('[RootLayout] Parsed flash message:', flashMessage);
				sessionStorage.removeItem('flashMessage');

				const opts = {
					title: flashMessage.title,
					description: flashMessage.description, // Use 'description' instead of 'message' for Skeleton v4
					type: flashMessage.type,
					duration: flashMessage.duration || 5000
				};

				// Small delay to ensure render cycle is complete
				setTimeout(() => {
					console.log('[RootLayout] Triggering toast:', flashMessage.type);
					// Use static toaster import
					if (flashMessage.type === 'success') toaster.success(opts);
					else if (flashMessage.type === 'warning') toaster.warning(opts);
					else if (flashMessage.type === 'error') toaster.error(opts);
					else toaster.info(opts);
				}, 100);
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
		if (!(themeStore.autoRefreshEnabled && browser)) return;

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
		if (!browser) return;

		const controller = new AbortController();

		(async () => {
			try {
				const AccessibilityHelp = (await import('@components/system/AccessibilityHelp.svelte')).default;
				const { modalState } = await import('@utils/modalState.svelte');

				if (controller.signal.aborted) return;

				function handleGlobalKeydown(e: KeyboardEvent) {
					// '?' key (Shift + /) to open accessibility help
					if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
						// Avoid triggering if user is typing in an input/textarea
						const target = e.target as HTMLElement;
						if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
							return;
						}

						e.preventDefault();
						modalState.trigger(AccessibilityHelp, { ariaLabel: 'Accessibility Help' });
					}

					// 'Alt + T' to toggle theme
					if (e.altKey && e.key.toLowerCase() === 't') {
						e.preventDefault();
						// Based on themeStore.svelte.ts, the function is toggleDarkMode
						import('@stores/themeStore.svelte').then(({ toggleDarkMode }) => {
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

<svelte:head> <title>{siteName}</title> </svelte:head>

<DialogManager />
<Portal> <ToastManager position="bottom-center" /> </Portal>

{#key currentLocale}
	{#if screen.isMobile && !page.url.pathname.includes('/setup')}
		<Portal> <FloatingNav /> </Portal>
	{/if}

	{@render children?.()}
{/key}

<CookieConsent />
