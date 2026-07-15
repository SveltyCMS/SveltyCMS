<!--
@file src/routes/+layout.svelte
@component
**Global Root Layout**: The primary entry point for the entire application.

This layout initializes the most critical global states (i18n, Theme, Settings).

### Responsibilities:
- Paraglide i18n initialization and language bridging.
- Native UI components (Toasts, Modals).
- WebMCP Support for peripheral tool registration.
- Zero-latency content system hydration and SSE start.

### Next Steps & Options:
- Navigate to dashboard or collection views.
- Access global search (Mod+K).
- Change site-wide theme or language.
-->

<script lang="ts">
// Selected theme
import "../app.css";
// Register Iconify custom element globally
import "iconify-icon";

import { onMount, untrack } from "svelte";
import { browser } from "$app/environment";
import { page } from "$app/state";
import { beforeNavigate, afterNavigate } from "$app/navigation";

// WebMCP Support (Polyfill + Plugin)
import "@mcp-b/webmcp-polyfill";

// Components
import DialogManager from "@src/components/system/dialog-manager.svelte";
import ToastContainer from "@src/components/toast-container.svelte";
// Paraglide locale bridge
	import {
		locales as availableLocales,
		getLocale,
		setLocale,
		getTextDirection,
	} from "@src/paraglide/runtime";
import CookieConsent from "@src/plugins/cookie-consent/cookie-consent.svelte";
import { initWebMCP } from "@src/plugins/webmcp/init";
// Global Settings
import { initPublicEnv, publicEnv } from "@src/stores/global-settings.svelte";
import {
	globalLoadingStore,
	loadingOperations,
} from "@src/stores/loading-store.svelte";
// Native UI Components v4
import { app } from "@src/stores/store.svelte.ts";
import { toast } from "@src/stores/toast.svelte.ts";
// Theme management
import {
	initializeDarkMode,
	initializeThemeStore,
	themeStore,
} from "@src/stores/theme-store.svelte";
import { screen } from "@src/stores/screen-size-store.svelte";


// Props
interface Props {
	children?: import("svelte").Snippet;
}
const { children }: Props = $props();

// ============================================================================
// State Management
// ============================================================================

let currentLocale = $state(getLocale());
let isMounted = $state(false);

// ============================================================================
// Cognitive Session & Focus State Management
// ============================================================================
let sessionRemainingTime = $state(900); // 15 minutes (900s) default session length
let sessionPhase = $state<"normal" | "warning" | "critical" | "expired">("normal");
let lastInteractionTime = $state(Date.now());
let sessionInterval: ReturnType<typeof setInterval> | undefined;

// Focus coordinates tracking for state restoration
let lastFocusedSelector = $state<string | null>(null);

function resetSessionTimer() {
	if (sessionPhase === "expired") return;
	lastInteractionTime = Date.now();
	sessionRemainingTime = 900;
	if (sessionPhase !== "normal") {
		sessionPhase = "normal";
		// Focus restoration after extending session
		setTimeout(() => {
			if (lastFocusedSelector) {
				const target = document.querySelector(lastFocusedSelector) as HTMLElement;
				target?.focus();
			}
		}, 100);
	}
}

// Global window event listener to track user activity and focus coordinate changes
function handleUserActivity(e: Event) {
	resetSessionTimer();

	// Track the selector of the active element to restore it on mount/navigation boundaries
	const target = e.target as HTMLElement;
	if (target) {
		if (target.id) {
			lastFocusedSelector = `#${target.id}`;
		} else if (target.getAttribute("data-testid")) {
			lastFocusedSelector = `[data-testid="${target.getAttribute("data-testid")}"]`;
		} else if (target.getAttribute("name")) {
			const name = target.getAttribute("name");
			lastFocusedSelector = `${target.tagName.toLowerCase()}[name="${name}"]`;
		}
	}
}

// Navigation-aware toast handling
beforeNavigate(() => toast.handleBeforeNavigate());
afterNavigate(() => {
	toast.handleAfterNavigate();

	// State-Bound Focus Restoration
	setTimeout(() => {
		if (lastFocusedSelector) {
			const target = document.querySelector(lastFocusedSelector) as HTMLElement;
			if (target) {
				console.log(`[A11y] Restoring focus to state-bound selector: ${lastFocusedSelector}`);
				target.focus();
			}
		}
	}, 150);
});

// Reactively run countdown timer
$effect(() => {
	const user = page.data.user;
	if (browser && user) {
		resetSessionTimer();
		sessionInterval = setInterval(() => {
			const idleSeconds = Math.floor((Date.now() - lastInteractionTime) / 1000);
			sessionRemainingTime = Math.max(0, 900 - idleSeconds);

			if (sessionRemainingTime <= 0) {
				sessionPhase = "expired";
				clearInterval(sessionInterval);
				window.location.href = "/login?timeout=true";
			} else if (sessionRemainingTime <= 120) {
				if (sessionPhase !== "critical") {
					sessionPhase = "critical";
					setTimeout(() => {
						const warnBtn = document.getElementById("extend-session-btn");
						warnBtn?.focus();
					}, 100);
				}
			} else if (sessionRemainingTime <= 300) {
				sessionPhase = "warning";
			} else {
				sessionPhase = "normal";
			}
		}, 1000);
	} else {
		if (sessionInterval) {
			clearInterval(sessionInterval);
			sessionInterval = undefined;
		}
		sessionPhase = "normal";
	}

	return () => {
		if (sessionInterval) {
			clearInterval(sessionInterval);
		}
	};
});

// ============================================================================
// Initialization
// ============================================================================

import { setContentStructure } from "@src/stores/collection-store.svelte";
import { initializeContent } from "@src/content";
	import Button from '@components/ui/button.svelte';

// Initialize public environment settings from server data
// Note: Only access page.data after mount to avoid hydration issues
if (browser) {
	globalLoadingStore.startLoading(loadingOperations.initialization);
}

$effect(() => {
	if (browser && page.data) {
		untrack(() => {
			if (page.data.settings) {
				initPublicEnv(page.data.settings);
			}
			if (page.data.navigationStructure) {
				setContentStructure(page.data.navigationStructure);
				// Initialize the modern content system with hydration data
				initializeContent(page.data as any);
				// Mark initialization as finished successfully here
				globalLoadingStore.stopLoading(loadingOperations.initialization);
			} else if (page.data.user === null) {
				// If no user and no structure, we might be on a setup/login page
				// Clear initialization to allow the page to render
				globalLoadingStore.stopLoading(loadingOperations.initialization);
			}
		});
	}
});

// ============================================================================
// Mount Lifecycle
// ============================================================================

onMount(() => {
	console.log("[RootLayout] Mounting in", browser ? "browser" : "server");

	// Initialize screen size tracking (resize listener + window.innerWidth)
	// Without this, screen.isMobile/isDesktop use SSR defaults (1024px)
	screen.mount();

	// URL is the source of truth on initial load
	const urlLocale = getLocale();
	if (
		urlLocale &&
		availableLocales.includes(urlLocale as any) &&
		app.systemLanguage !== urlLocale
	) {
		console.log(
			`[RootLayout] Aligning store (${app.systemLanguage}) to URL (${urlLocale})`,
		);
		app.systemLanguage = urlLocale as any;
		currentLocale = urlLocale;
	}

	// Set <html> dir + lang for RTL support on initial load
	if (browser && document?.documentElement) {
		const initialLocale = getLocale();
		document.documentElement.dir = getTextDirection(initialLocale as any);
		document.documentElement.lang = initialLocale || "en";
	}

	// Initialize dark mode
	initializeDarkMode();

	// Initialize toast navigation handlers (must be called from onMount)
	toast.init();

	// Initialize WebMCP (Client-side AI Tools)
	if (browser) {
		// Tiny delay to ensure polyfill overrides are settled
		setTimeout(() => {
			initWebMCP().catch(console.error);
		}, 100);
	}

	// Register audit history slot for entry edit sidebar
	import('@src/plugins/slot-registry').then(({ slotRegistry }) => {
		slotRegistry.register({
			id: 'audit-history',
			zone: 'entry_edit_sidebar',
			component: () => import('@components/audit/audit-history.svelte'),
			position: 100,
		});
	});

	isMounted = true;

	// Hide cold-start splash screen after hydration
	if (browser) {
		const splash = document.getElementById("svelty-splash");
		if (splash) {
			// 🚀 OPTIMIZATION: Remove loading class to restore theme background
			document.documentElement.classList.remove("svelty-loading");

			// Start fade-out
			splash.style.opacity = "0";
			splash.style.visibility = "hidden";

			// Clean up DOM after transition
			setTimeout(() => {
				splash.remove();
			}, 150);
		}
	}

	return () => {
		screen.destroy();
	};
});

/**
 * Reactive Flash Message Detection
 * Watches for URL changes and triggers toast's flash message processor.
 */
$effect(() => {
	if (!(browser && isMounted)) {
		return;
	}

	// Depend on page.url to trigger this effect on every navigation
	void page.url.pathname;

	// Delegate to toast store
	toast.checkFlash();
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
		if (
			desired &&
			availableLocales.includes(desired as any) &&
			current !== desired
		) {
			console.log("[RootLayout] Store changed, updating locale:", desired);

			// Update Paraglide locale (handles routing internally)
			setLocale(desired as any, { reload: false });
			currentLocale = desired as any;

			// Persist to localStorage so the preference survives sessions
			if (browser) {
				globalThis.localStorage.setItem("systemLanguage", desired);
			}

			// Update <html> dir attribute for RTL language support
			if (browser && document?.documentElement) {
				document.documentElement.dir = getTextDirection(desired as any);
				document.documentElement.lang = desired;
			}
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
const siteName = $derived(publicEnv?.SITE_NAME || "SveltyCMS");

// Global Keyboard Shortcuts
onMount(() => {
	if (!browser) {
		return;
	}

	const controller = new AbortController();

	(async () => {
		try {
			const ACCESSIBILITY_HELP = (
				await import("@components/system/accessibility-help.svelte")
			).default;
			const { modalState } = await import("@utils/modal.svelte");

			if (controller.signal.aborted) {
				return;
			}

			function handleGlobalKeydown(e: KeyboardEvent) {
				// '?' key (Shift + /) to open accessibility help
				if (e.key === "?" && !e.ctrlKey && !e.metaKey && !e.altKey) {
					// Avoid triggering if user is typing in an input/textarea
					const target = e.target as HTMLElement;
					if (
						target.tagName === "INPUT" ||
						target.tagName === "TEXTAREA" ||
						target.isContentEditable
					) {
						return;
					}

					e.preventDefault();
					modalState.trigger(ACCESSIBILITY_HELP, {
						ariaLabel: "Accessibility Help",
					});
				}

				// 'Alt + T' to toggle theme
				if (e.altKey && e.key.toLowerCase() === "t") {
					e.preventDefault();
					// Based on themeStore.svelte.ts, the function is toggleDarkMode
					import("@src/stores/theme-store.svelte").then(
						({ toggleDarkMode }) => {
							toggleDarkMode();
						},
					);
				}
			}

			window.addEventListener("keydown", handleGlobalKeydown);

			if (browser) {
				window.addEventListener("click", handleUserActivity, { passive: true });
				window.addEventListener("keydown", handleUserActivity, { passive: true });
				window.addEventListener("focusin", handleUserActivity, { passive: true });
			}

			controller.signal.addEventListener("abort", () => {
				window.removeEventListener("keydown", handleGlobalKeydown);
				if (browser) {
					window.removeEventListener("click", handleUserActivity);
					window.removeEventListener("keydown", handleUserActivity);
					window.removeEventListener("focusin", handleUserActivity);
				}
			});
		} catch (err) {
			console.error("Failed to setup global keyboard shortcuts:", err);
		}
	})();

	return () => controller.abort();
});
</script>

<svelte:head><title>{siteName}</title></svelte:head>

<DialogManager />
<ToastContainer position="responsive" />

<svelte:boundary>
	{#snippet failed(error: any, reset: any)}
		<div class="flex h-screen w-full flex-col items-center justify-center space-y-6 bg-surface-50 text-center dark:bg-surface-900">
			<div class="space-y-2">
				<h1 class="text-4xl font-bold text-error-500">System Error</h1>
				<p class="text-surface-600 dark:text-surface-400">
					An unexpected runtime error occurred. Our self-healing systems are investigating.
				</p>
			</div>

			<div class="max-w-md rounded border border-surface-200 bg-surface-100 p-4 text-start text-sm font-mono dark:border-surface-800 dark:bg-surface-800">
				<p class="text-error-600 dark:text-error-500">{error.message}</p>
			</div>

			<div class="flex gap-4">
				<Button variant="primary" onclick={reset}>
					Try Again
				</Button>
				<Button variant="ghost" onclick={() => window.location.reload()}>
					Reload Page
				</Button>
			</div>
		</div>
	{/snippet}

	{#key currentLocale}
		{@render children?.()}
	{/key}
</svelte:boundary>

<CookieConsent />

<!-- Progressive Session Timeout Warning Overlay/Banners -->
{#if sessionPhase === 'warning'}
	<div
		class="fixed bottom-4 inset-e-4 z-50 flex max-w-sm items-center justify-between gap-4 rounded border border-warning-500/30 bg-surface-100/80 p-4 shadow-xl backdrop-blur-md dark:bg-surface-800/80 text-surface-900 dark:text-surface-100"
		role="status"
		aria-live="polite"
	>
		<div class="flex items-center gap-3">
			<span class="flex h-8 w-8 items-center justify-center rounded-full bg-warning-500/20 text-warning-500">
				<iconify-icon icon="mdi:alert-circle-outline" width="20"></iconify-icon>
			</span>
			<div>
				<p class="text-sm font-semibold">Inactivity Timeout Warning</p>
				<p class="text-xs text-surface-600 dark:text-surface-400">Session expires in {Math.floor(sessionRemainingTime / 60)}m {sessionRemainingTime % 60}s</p>
			</div>
		</div>
		<Button variant="warning"
			onclick={resetSessionTimer}
		 size="sm">
			Extend
		</Button>
	</div>
{:else if sessionPhase === 'critical'}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-lg"
		role="alertdialog"
		aria-modal="true"
		aria-labelledby="critical-timeout-title"
		aria-describedby="critical-timeout-desc"
	>
		<div class="max-w-md w-full rounded-2xl border border-error-500/40 bg-surface-100 p-6 shadow-2xl dark:bg-surface-900 text-surface-900 dark:text-surface-100">
			<div class="flex flex-col items-center text-center space-y-4">
				<span class="flex h-16 w-16 items-center justify-center rounded-full bg-error-500/20 text-error-500">
					<iconify-icon icon="mdi:clock-alert-outline" width="36"></iconify-icon>
				</span>

				<div class="space-y-1">
					<h2 id="critical-timeout-title" class="text-xl font-bold text-error-500">Critical Session Timeout</h2>
					<p id="critical-timeout-desc" class="text-sm text-surface-600 dark:text-surface-400">
						Your session is about to expire due to inactivity. Please extend your session now to avoid losing unsaved data.
					</p>
				</div>

				<div class="text-3xl font-black font-mono tracking-wider text-error-500 animate-pulse">
					{Math.floor(sessionRemainingTime / 60)}:{(sessionRemainingTime % 60).toString().padStart(2, '0')}
				</div>

				<div class="flex gap-4 w-full">
					<Button variant="error"
						id="extend-session-btn"
						onclick={resetSessionTimer}
					 class="w-full py-3 text-base shadow-lg">
						Extend Session Now
					</Button>
				</div>
			</div>
		</div>
	</div>
{/if}
