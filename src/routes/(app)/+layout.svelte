<!--
@file src/routes/(app)/+layout.svelte
@component
**Authenticated Admin Layout**: Wraps all core CMS views (Collections, Media, User Settings).

This layout provides the administrative shell, including sidebars and header controls.

### Responsibilities:
- Managing admin-specific UI state (Sidebar expansion, Mode switching).
- Initializing Widgets and Theme in the authenticated context.
- Providing navigation guards and auto-save draft functionality.
- Responsive sidebar: inline on desktop, overlay drawer on mobile.

### Next Steps & Options:
- Expand/Collapse sidebars for more horizontal space.
- Use Global Search (Alt+G or Mod+K) for quick navigation.
- Switch between Content (Collections) and Media Gallery modes.
-->

<script lang="ts">
import FloatingNav from "@src/components/system/floating-nav.svelte";
import HeaderEdit from "@src/components/header-edit.svelte";
import LeftSidebar from "@src/components/left-sidebar.svelte";
import PageFooter from "@src/components/page-footer.svelte";
import RightSidebar from "@src/components/right-sidebar.svelte";
import CommandPalette from "@src/components/command-palette.svelte";
// Type Imports
import type { User } from "@src/databases/auth/types";
import type { ContentNode } from "@src/content/types";
// Stores
import {
	setMode,
} from "@src/stores/collection-store.svelte.ts";
import {
	globalLoadingStore,
	loadingOperations,
} from "@src/stores/loading-store.svelte.ts";
import { screen } from "@src/stores/screen-size-store.svelte";
import { app } from "@src/stores/store.svelte";
import { initializeDarkMode } from "@src/stores/theme-store.svelte.ts";
import { ui } from "@src/stores/ui-store.svelte";
import { widgets } from "@src/stores/widget-store.svelte.ts";
import Portal from "@components/ui/portal.svelte";
import BackToTop from "@components/ui/back-to-top.svelte";
import Slot from "@components/system/slot.svelte";
import AdminZone from "@components/system/admin-zone.svelte";
import { setAdminZoneCapabilityChecker } from "@src/plugins/admin-zone-registry.svelte.ts";
import PluginWorkspaceOverlay from "@components/system/plugin-workspace-overlay.svelte";
import { setThemeContext } from "@src/components/ui/theme-context.svelte";
// Utils
import { getTextDirection } from "@utils/utils";
import { mergeAdminThemeWithUserPrefs } from "@utils/theme-merge";
import {
	applyLayoutPrefsToUiState,
	diffLayoutPrefsFromTenant,
	uiStateToLayoutPrefs,
} from "@utils/layout-state-prefs";
import { clientJsonHeaders } from "@utils/security/client-csrf";
import { userThemePrefs } from "@src/stores/user-prefs-overlay.svelte";
import { floatingNavStore } from "@src/stores/floating-nav-store.svelte";
	import { onMount, untrack } from "svelte";
	import { initBounceDetector } from "@utils/bounce-detector";
	import { initPredictivePreload } from "@utils/predictive-preload";
	import { registerHotkey } from "@src/utils/hotkeys";
// SvelteKit Navigation
import { afterNavigate, beforeNavigate, invalidate } from "$app/navigation";
import { page } from "$app/state";

import { setContentContext } from "@src/content";

// =============================================
// TYPE DEFINITIONS
// =============================================

interface LayoutData {
	contentStructure: Promise<ContentNode[]>;
	settings: Record<string, any>;
	user: User | null;
	tenantId?: string | null;
	darkMode: boolean;
	nonce: string;
	theme: import("@src/databases/db-interface").Theme;
	predictedNextPath?: string | null;
}

interface Props {
	children?: import("svelte").Snippet;
	data: LayoutData;
}

// =============================================
// STATE & DERIVED
// =============================================

const { children, data }: Props = $props();

// Initialize Content Context
setContentContext(untrack(() => data.tenantId) || null);

// Initialize Adaptive Workspace Theme Context based on User Role
const userRole = $derived(data.user?.role || 'editor');

// Try to load admin theme config from the active DB theme, fall back to role-based defaults
// The config shape is dynamic (JSON from DB), so we use Record<string, any>
const dbAdminConfig = $derived(
	(data.theme as any)?.config?.adminTheme as Record<string, any> | undefined
);

const tenantThemeDefaults = $derived(
	mergeAdminThemeWithUserPrefs(dbAdminConfig, undefined, userRole)
);
const initialDensity = $derived(tenantThemeDefaults.density);
const initialVariant = $derived(tenantThemeDefaults.variant);

const theme = setThemeContext(untrack(() => ({
	id: 'default',
	name: 'Default',
	role: userRole as any,
	density: initialDensity,
	variant: initialVariant as any,
	accentMode: 'default',
	themeName: (data.theme as any)?.name || 'default',
	customCss: dbAdminConfig?.customCss,
	features: {
		stickyActionBar: dbAdminConfig?.features?.stickyActionBar ?? false,
		collapsibleSidebar: dbAdminConfig?.features?.collapsibleSidebar ?? ui.state.leftSidebar !== 'hidden',
		brandedLogin: dbAdminConfig?.features?.brandedLogin ?? false,
		highContrastMode: dbAdminConfig?.features?.highContrastMode ?? false,
		reducedMotion: dbAdminConfig?.features?.reducedMotion ?? false,
		layoutRegions: dbAdminConfig?.features?.layoutRegions ?? { collections: 'left', mediaGalleries: 'left' },
	},
})));

$effect(() => {
	void data.user?.preferences?.theme;
	userThemePrefs.release();
});

// Per-user floating nav (system defaults + PageTitle favorites) — bind early so mobile FAB + stars stay in sync
$effect(() => {
	floatingNavStore.bindUser(data.user ?? null);
});

// Client-side capability gate for plugin admin zones (server enforces 403 too).
$effect(() => {
	const u = data.user as any;
	setAdminZoneCapabilityChecker((required: string[]) => {
		if (!u) return false;
		const isAdmin = !!u.isAdmin || u.role === "admin" || u.role === "super-admin";
		return isAdmin || required.length === 0;
	});
});

$effect(() => {
	const serverPrefs = data.user?.preferences?.theme;
	const merged = mergeAdminThemeWithUserPrefs(
		dbAdminConfig,
		userThemePrefs.getEffective(serverPrefs),
		userRole,
	);
	theme.role = userRole as any;
	theme.density = merged.density;
	theme.variant = merged.variant as any;
	theme.features = merged.features;
	theme.customCss = dbAdminConfig?.customCss;
});

// ── Layout state: tenant defaults, then per-user overrides ──
let layoutStateRestored = false;
let lastAppliedUserLayout = "";
$effect(() => {
	const layoutLocked = dbAdminConfig?.lockedSettings?.layoutState === true;
	const effectivePrefs = userThemePrefs.getEffective(data.user?.preferences?.theme);
	const userLayout = effectivePrefs?.layoutState;
	const serialized = JSON.stringify(userLayout ?? {});

	if (!layoutStateRestored && dbAdminConfig?.layoutState) {
		applyLayoutPrefsToUiState(dbAdminConfig.layoutState, ui.state);
		layoutStateRestored = true;
	}

	if (userLayout && !layoutLocked && serialized !== lastAppliedUserLayout) {
		for (const [key, val] of Object.entries(userLayout)) {
			if ((key === "leftSidebar" || key === "rightSidebar") && !screen.isDesktop) continue;
			if (val === "full" || val === "hidden") {
				ui.state[key as keyof typeof ui.state] = val;
			}
		}
		lastAppliedUserLayout = serialized;
	}
});

// Debounced save: admins → tenant theme; others → per-user layout prefs (diff from tenant)
let layoutSaveTimer: ReturnType<typeof setTimeout>;
$effect(() => {
	void ui.state.leftSidebar;
	void ui.state.rightSidebar;
	void ui.state.pageheader;
	void ui.state.pagefooter;
	void ui.state.header;
	void ui.state.footer;

	clearTimeout(layoutSaveTimer);
	layoutSaveTimer = setTimeout(async () => {
		if (!data.user) return;

		const prefs = uiStateToLayoutPrefs(ui.state);
		const isAdmin = data.user.isAdmin || data.user.role === "admin";

		if (isAdmin) {
			try {
				await fetch("/api/theme/admin-theme", {
					method: "POST",
					headers: { "Content-Type": "application/json", "X-CSRF-Token": page.data.csrfToken || "" },
					body: JSON.stringify({ layoutState: prefs }),
				});
			} catch {
				/* silent — layout state save is best-effort */
			}
			return;
		}

		const layoutLocked = dbAdminConfig?.lockedSettings?.layoutState === true;
		if (layoutLocked) return;

		const diff = diffLayoutPrefsFromTenant(prefs, dbAdminConfig?.layoutState);
		try {
			await fetch("/api/user/update-user-attributes", {
				method: "PUT",
				headers: clientJsonHeaders(),
				body: JSON.stringify({
					user_id: "self",
					newUserData: { preferences: { theme: { layoutState: diff } } },
				}),
			});
			userThemePrefs.apply({ layoutState: diff as unknown as Record<string, "full" | "hidden"> });
		} catch {
			/* silent — layout state save is best-effort */
		}
	}, 2000);
});

// Component State
let loadError = $state<Error | null>(null);

// =============================================
// DERIVED STATE
// =============================================

// seoDescription logic
const siteName = $derived(data.settings?.siteName || "SveltyCMS");
const seoDescription = $derived(`${siteName} - a modern, powerful, and easy-to-use CMS powered by SvelteKit. Manage your content with ease & take advantage of the latest web technologies.`);

// =============================================
// REACTIVE EFFECTS
// =============================================

// Sync mode from URL (helps UI store show/hide sidebars even on error pages)
$effect(() => {
	const isCreate = page.url.searchParams.get("create") === "true";
	const isEdit = page.url.searchParams.get("edit") === "true";

	if (isCreate) {
		setMode("create");
	} else if (isEdit) {
		setMode("edit");
	} else if (page.url.pathname.includes("/mediagallery")) {
		setMode("media");
	}
});


// Effect: Handle system language changes
$effect(() => {
	const lang = app.systemLanguage;
	if (!lang) {
		return;
	}

	const dir = getTextDirection(lang);
	if (!dir) {
		return;
	}

	document.documentElement.dir = dir;
	document.documentElement.lang = lang;
});

// 🔥 SYNC: Connect streamed content structure to global stores for sidebar/navigation reactivity
$effect(() => {
	data.contentStructure.then((nodes) => {
		untrack(() => {
			import("@src/stores/collection-store.svelte").then(({ setContentStructure }) => {
				setContentStructure(nodes);
			});
		});
	});
});

// =============================================
// LIFECYCLE HOOKS
// =============================================

onMount(() => {
	// Initialize predictive preloading (physics cone + behavioral smart)
	initPredictivePreload();
	initBounceDetector();
	widgets.initialize();
	initializeDarkMode(data.theme as any);

	// Primary Mod+K + Gin/Coffee-style Alt+G (same on Windows, Linux, macOS)
	registerHotkey("mod+k", () => ui.toggleGlobalSearch(), "Open global search / command palette");
	registerHotkey("alt+g", () => ui.toggleGlobalSearch(), "Open global search");

	registerHotkey(
		"mod+s",
		() => {
			window.dispatchEvent(new CustomEvent("global-save-request"));
		},
		"Save (global)",
	);

	registerHotkey(
		"escape",
		() => ui.closeGlobalSearch(),
		"Close Overlays/Command Palette",
		false,
	);
});

// 🔥 HMR: Prefer surgical contentStore patch; fall back to soft invalidate.
// Keeps session, consent, and form context. Avoids full layout data refetch when possible.
if (import.meta.hot) {
	import.meta.hot.on("svelty:content-update", async (data?: import("@src/content/content-hmr").ContentHmrPayload) => {
		if (data?.noOp) return;
		try {
			const { applyContentHmrPatch } = await import("@src/content/content-hmr");
			if (applyContentHmrPatch(data)) {
				// Surgical upsert applied — no layout load round-trip
				return;
			}
		} catch {
			// Surgical patch optional — fall back to full content invalidate
		}
		invalidate("app:content");
	});
	// Theme file sync: refresh theme list when /themes/*.json changes
	import.meta.hot.on("svelty:theme-update", () => {
		invalidate("app:content");
	});
}

beforeNavigate(({ from, to }) => {
	if (from && to && from.route.id !== to.route.id) {
		globalLoadingStore.startLoading(loadingOperations.navigation);
	}
});

afterNavigate(() => {
	// Mobile sidebar should start hidden by default (user opens via hamburger)
	if (screen.isMobile) ui.state.leftSidebar = 'hidden';
	globalLoadingStore.stopLoading(loadingOperations.navigation);
	setTimeout(() => {
		if (
			globalLoadingStore.loadingStack.size === 1 &&
			globalLoadingStore.isLoadingReason(loadingOperations.navigation)
		) {
			globalLoadingStore.stopLoading(loadingOperations.navigation);
		}
	}, 100);
});
</script>

	<svelte:head>
		{#if data.predictedNextPath}
			<link rel="prefetch" href={data.predictedNextPath} />
		{/if}
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
	{#if theme.customCss}
		<style>
			{theme.customCss}
		</style>
	{/if}
</svelte:head>

{#if loadError}
	<div class="flex h-screen w-screen items-center justify-center bg-error-50 dark:bg-error-900">
		<div class="text-center">
			<h1 class="text-2xl font-bold text-error-600 dark:text-error-300">Application Error</h1>
			<p class="mt-2 text-error-500 dark:text-error-500">{loadError.message}</p>
		</div>
	</div>
{:else}
	<div
		class="relative h-lvh w-full"
		data-admin-theme={theme.themeName}
		data-density={theme.density}
		data-reduced-motion={theme.features.reducedMotion ? 'true' : 'false'}
		style="
			--admin-spacing-scale: {theme.spacingScale};
			--admin-density: {theme.densityScale};
			--admin-radius-base: {theme.radiusBase};
			--admin-radius-card: {theme.radiusCard};
			--admin-radius-input: {theme.radiusInput};
			--admin-radius-button: {theme.radiusButton};
			--admin-sidebar-width: {theme.sidebarWidth};
			--admin-header-height: {theme.headerHeight};
			--admin-sticky-bar-height: {theme.stickyBarHeight};
		"
	>
		{#if ui.isCommandBarVisible || ui.isSearchVisible}
			<CommandPalette />
		{/if}

		<div class="relative z-0">
			<div class="flex h-lvh flex-col overflow-hidden">
			{#if ui.state.header !== 'hidden'}
				<header class="sticky top-0 z-10" style="height: var(--admin-header-height, 32px); min-height: 4px;">
					<Slot name="global-toolbar" />
					<AdminZone zone="header" inline={true} />
					<AdminZone zone="toolbar" inline={true} />
				</header>
			{/if}

			<div class="flex flex-1 overflow-hidden">
				<!-- Desktop / tablet: inline sidebar (inside flex flow) -->
				{#if !screen.isMobile && ui.state.leftSidebar !== 'hidden'}
					<aside
						class="max-h-dvh border-e bg-surface-50 px-2! text-center transition-[width] duration-300 ease-in-out dark:border-surface-700 dark:bg-surface-900 overflow-visible {ui.state.leftSidebar === 'full' ? '' : 'w-fit'}"
						style="width: {ui.state.leftSidebar === 'full' ? 'var(--admin-sidebar-width, 240px)' : ''}"
						aria-label="Left sidebar navigation"
					>
						<LeftSidebar />
					</aside>
				{/if}

				<main class="relative z-0 flex w-full min-w-0 flex-1 flex-col">
					{#if ui.state.pageheader !== 'hidden'}
						<header class="sticky top-0 z-20 w-full"><HeaderEdit /></header>
					{/if}

					{@render children?.()}

					<!-- Sticky action bar (only rendered when content exists) -->
					{#if theme.features.stickyActionBar && ui.stickyActionContent}
						<div class="sticky bottom-0 z-20 w-full border-t border-surface-200 dark:border-surface-700 bg-white/95 dark:bg-surface-900/95 backdrop-blur-md"
							style="min-height: var(--admin-sticky-bar-height, 56px);"
							role="toolbar"
							aria-label="Page actions"
							aria-live="polite"
						>
							<div class="flex items-center justify-end gap-2 px-4 py-2">
								{@render ui.stickyActionContent()}
							</div>
						</div>
					{/if}

					{#if ui.state.pagefooter !== 'hidden'}
						<footer class="mt-auto w-full bg-surface-50 bg-linear-to-b px-1 text-center dark:from-surface-700 dark:to-surface-900">
							<PageFooter />
						</footer>
					{/if}
				</main>

				<!-- Desktop: inline right sidebar -->
				{#if !screen.isMobile && ui.state.rightSidebar !== 'hidden'}
					<aside
						class="max-h-dvh w-60 border-s bg-white bg-linear-to-r dark:border-surface-500 dark:from-surface-700 dark:to-surface-900"
						aria-label="Right sidebar"
					>
						<RightSidebar />
					</aside>
				{/if}
			</div>

			<!-- Mobile: overlay sidebar drawer (outside flex flow via Portal) -->
			{#if screen.isMobile && ui.state.leftSidebar !== 'hidden'}
				<Portal>
					<!-- Backdrop -->
					<button
						type="button"
						class="fixed inset-0 z-40 bg-surface-900/40 backdrop-blur-xs dark:bg-black/50"
						aria-label="Close left sidebar"
						onclick={() => ui.toggle('leftSidebar', 'hidden')}
					></button>
					<!-- Drawer -->
					<div
						class="fixed inset-s-0 top-0 z-50 flex h-dvh max-h-dvh w-[min(100vw,var(--admin-sidebar-width,240px))] flex-col overflow-visible border-e border-surface-200 bg-surface-50 px-2! text-center shadow-lg dark:border-surface-700 dark:bg-surface-900"
						role="dialog"
						aria-modal="true"
						aria-label="Left sidebar navigation"
					>
						<LeftSidebar />
					</div>
				</Portal>
			{/if}

			<!-- Mobile: overlay right sidebar drawer (slides in from right) -->
			{#if screen.isMobile && ui.state.rightSidebar !== 'hidden'}
				<Portal>
					<!-- Backdrop -->
					<button
						type="button"
						class="fixed inset-0 z-40 bg-surface-900/40 backdrop-blur-xs dark:bg-black/50"
						aria-label="Close right sidebar"
						onclick={() => ui.toggle('rightSidebar', 'hidden')}
					></button>
					<!-- Drawer -->
					<div
						class="fixed inset-e-0 top-0 z-50 flex h-dvh max-h-dvh w-[min(100vw,var(--admin-sidebar-width,240px))] flex-col overflow-visible border-s border-surface-200 bg-surface-50 px-2! shadow-lg dark:border-surface-700 dark:bg-surface-900"
						role="dialog"
						aria-modal="true"
						aria-label="Right sidebar"
					>
						<RightSidebar />
					</div>
				</Portal>
			{/if}

			{#if ui.state.footer !== 'hidden'}
				<footer style="min-height: var(--admin-header-height, 24px);">
					<Slot name="global-footer" />
					<AdminZone zone="footer" inline={true} />
				</footer>
			{/if}
		</div>
		</div>

		{#if screen.isMobile}
			<Portal>
				<FloatingNav />
			</Portal>
		{/if}
		<BackToTop />
		<PluginWorkspaceOverlay />
	</div>
{/if}
