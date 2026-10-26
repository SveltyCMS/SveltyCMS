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
	import FloatingNav from '@src/components/system/floating-nav.svelte';
	import HeaderEdit from '@src/components/header-edit.svelte';
	import LeftSidebar from '@src/components/left-sidebar.svelte';
	import PageFooter from '@src/components/page-footer.svelte';
	import RightSidebar from '@src/components/right-sidebar.svelte';
	import CommandPalette from '@src/components/command-palette.svelte';
	import TokenPicker from '@src/components/token-picker.svelte';
	// Type Imports
	import type { User } from '@src/databases/auth/types';
	import { isAdmin } from '@src/databases/auth/constants';
	import type { ContentNode } from '@src/content/types';
	// Stores
	import {
		applyRemoteContentStructure,
		collections,
		setMode
	} from '@src/stores/collection-store.svelte.ts';
	import { globalLoadingStore, loadingOperations } from '@src/stores/loading-store.svelte.ts';
	import { screen } from '@src/stores/screen-size-store.svelte';
	import { initializeDarkMode } from '@src/stores/theme-store.svelte.ts';
	import { locale } from '@src/stores/locale-store.svelte';
	import { ui } from '@src/stores/ui-store.svelte';
	import { widgets } from '@src/stores/widget-store.svelte.ts';
	import Portal from '@components/ui/portal.svelte';
	import {
		applayout_application_error,
		applayout_close_left_sidebar,
		applayout_close_right_sidebar,
		applayout_left_sidebar_nav,
		applayout_page_actions,
		applayout_right_sidebar
	} from '@src/paraglide/messages';
	import BackToTop from '@components/ui/back-to-top.svelte';
	import Slot from '@components/system/slot.svelte';
	import AdminZone from '@components/system/admin-zone.svelte';
	import { setAdminZoneCapabilityChecker } from '@src/plugins/admin-zone-registry.svelte.ts';
	import PluginWorkspaceOverlay from '@components/system/plugin-workspace-overlay.svelte';
	import { pluginWorkspace } from '@src/stores/plugin-workspace.svelte';
	import { setThemeContext } from '@src/components/ui/theme-context.svelte';
	// Utils
	import { adminPage, adminSlide } from '@utils/admin-transitions';
	import { getTextDirection } from '@utils/string';
	import { mergeAdminThemeWithUserPrefs } from '@utils/theme-merge';
	import {
		applyLayoutPrefsToUiState,
		diffLayoutPrefsFromTenant,
		uiStateToLayoutPrefs
	} from '@utils/layout-state-prefs';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import { userThemePrefs } from '@src/stores/theme-store.svelte';
	import { floatingNavStore } from '@src/stores/floating-nav-store.svelte';
	import { onMount, untrack } from 'svelte';
	import { fade } from 'svelte/transition';
	import { browser } from '$app/env';
	import { initBounceDetector } from '@utils/bounce-detector';
	import { initPredictivePreload } from '@utils/predictive-preload';
	import { registerHotkey } from '@src/utils/hotkeys';
	// SvelteKit Navigation
	import { afterNavigate, invalidate, onNavigate } from '$app/navigation';
	import { page } from '$app/state';

	import { setContentContext } from '@src/content';

	// =============================================
	// TYPE DEFINITIONS
	// =============================================

	interface LayoutData {
		/** Flat, sanitized node list from the ROOT layout (single owner of the tree). */
		contentNodes?: ContentNode[];
		settings: Record<string, any>;
		user: User | null;
		tenantId?: string | null;
		darkMode: boolean;
		nonce: string;
		theme: import('@src/databases/db-interface').Theme;
		predictedNextPath?: string | null;
	}

	interface Props {
		children?: import('svelte').Snippet;
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

	const theme = setThemeContext(
		untrack(() => ({
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
				collapsibleSidebar:
					dbAdminConfig?.features?.collapsibleSidebar ?? ui.state.leftSidebar !== 'hidden',
				brandedLogin: dbAdminConfig?.features?.brandedLogin ?? false,
				highContrastMode: dbAdminConfig?.features?.highContrastMode ?? false,
				reducedMotion: dbAdminConfig?.features?.reducedMotion ?? false,
				layoutRegions: dbAdminConfig?.features?.layoutRegions ?? {
					collections: 'left',
					mediaGalleries: 'left'
				}
			}
		}))
	);

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
			return isAdmin(u) || required.length === 0;
		});
	});

	$effect(() => {
		const serverPrefs = data.user?.preferences?.theme;
		const merged = mergeAdminThemeWithUserPrefs(
			dbAdminConfig,
			userThemePrefs.getEffective(serverPrefs),
			userRole
		);
		theme.role = userRole as any;
		theme.density = merged.density;
		theme.variant = merged.variant as any;
		theme.features = merged.features;
		theme.customCss = dbAdminConfig?.customCss;
	});

	/* ────────────────────────────────────────────────────────────────────────
   Theme token propagation — mirror onto <html>
   ────────────────────────────────────────────────────────────────────────
   The --admin-* custom properties are also written inline on the layout
   element below (so SSR paints the correct theme with no flash). But CSS
   custom properties only cascade to DESCENDANTS, and three things live
   outside that element:

     • Modal / Drawer / Popover / Tooltip — portalled into <body>, so they
       are siblings of the app shell, not children of it. Before this, an
       overlay opened from a spacious dark theme rendered with :root's cozy
       light defaults.
     • The page background itself, painted on <html> / <body>.
     • Anything a plugin renders through its own portal.

   Mirroring the same values onto document.documentElement makes the token
   layer document-wide, so every route and every overlay resolves one theme.
   The values are identical to the inline ones, so nothing conflicts.
   ──────────────────────────────────────────────────────────────────────── */
	$effect(() => {
		if (!browser) return;
		const root = document.documentElement;
		const tokens: Record<string, string> = {
			'--admin-spacing-scale': String(theme.spacingScale),
			'--admin-density': String(theme.densityScale),
			'--admin-radius-base': theme.radiusBase,
			'--admin-radius-card': theme.radiusCard,
			'--admin-radius-input': theme.radiusInput,
			'--admin-radius-button': theme.radiusButton,
			'--admin-sidebar-width': theme.sidebarWidth,
			'--admin-sidebar-compact-width': '120px',
			'--admin-header-height': theme.headerHeight,
			'--admin-sticky-bar-height': theme.stickyBarHeight
		};
		for (const [key, value] of Object.entries(tokens)) {
			if (value != null && value !== 'undefined') root.style.setProperty(key, value);
		}
		root.setAttribute('data-admin-theme', theme.themeName);
		root.setAttribute('data-density', theme.density);
		root.setAttribute('data-reduced-motion', theme.features.reducedMotion ? 'true' : 'false');

		return () => {
			// Leaving the (app) group (e.g. logout → /login) must hand the document
			// back to the :root defaults, otherwise the login screen keeps the last
			// admin's density and radii.
			for (const key of Object.keys(tokens)) root.style.removeProperty(key);
			root.removeAttribute('data-admin-theme');
			root.removeAttribute('data-density');
			root.removeAttribute('data-reduced-motion');
		};
	});

	// ── Page header (HeaderEdit) visibility ──
	//
	// HeaderEdit is an edit-mode toolbar, but the store default is
	// `pageheader: 'full'`. That default was painted by SSR on every view-mode
	// page and then corrected by `updateFromContext` after hydration, removing
	// a 56px toolbar from the flow — measured 0.066 CLS on /config. Deriving the
	// edit-ness from the URL too keeps the server response and the first client
	// render identical (the route is the only mode signal available to SSR).
	const editingRoute = $derived(
		page.url.searchParams.has('edit') || page.url.searchParams.get('create') === 'true'
	);
	const showPageHeader = $derived(
		editingRoute || ['edit', 'create', 'modify'].includes(collections.mode)
	);

	/**
	 * Sidebar state the server and the first client render must agree on.
	 *
	 * `updateFromContext` opens the right sidebar and collapses the left one for
	 * edit/create on desktop, but that runs *after* hydration. Rendering the
	 * store defaults on the server therefore snapped both sidebars into place on
	 * a cold edit load (256px + 120px of content movement). Route defaults are
	 * applied here until the user moves a sidebar themselves.
	 */
	const leftSidebarState = $derived.by(() => {
		if (ui.leftSidebarTouched || !editingRoute) return ui.state.leftSidebar;
		// Desktop keeps the full navigation tree while editing; compact navigation is
		// a tablet affordance. Matching `updateFromContext` here keeps SSR and the
		// first client frame identical (no width snap after hydration).
		return screen.isDesktop ? 'full' : 'hidden';
	});
	const rightSidebarState = $derived.by(() => {
		if (ui.rightSidebarTouched) return ui.state.rightSidebar;
		if (editingRoute && screen.isDesktop) return 'full';
		return ui.state.rightSidebar;
	});
	// Desktop edit/create keeps the entry metadata visible even when the right
	// sidebar is collapsed or hidden. Matches the SSR frame (URL-derived).
	const showPageFooter = $derived(
		ui.state.pagefooter !== 'hidden' || (editingRoute && screen.isDesktop)
	);
	/** True when the footer is only the edit-metadata fallback (no explicit layout pref). */
	const pageFooterIsFallback = $derived(ui.state.pagefooter === 'hidden');

	// ── Layout state: tenant defaults, then per-user overrides ──
	let layoutStateRestored = false;
	let lastAppliedUserLayout = '';
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
				if ((key === 'leftSidebar' || key === 'rightSidebar') && !screen.isDesktop) continue;
				if (val === 'full' || val === 'hidden') {
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
			const isAdminUser = isAdmin(data.user);

			if (isAdminUser) {
				try {
					await fetch('/api/theme/admin-theme', {
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'X-CSRF-Token': page.data.csrfToken || ''
						},
						body: JSON.stringify({ layoutState: prefs })
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
				await fetch('/api/user/update-user-attributes', {
					method: 'PUT',
					headers: clientJsonHeaders(),
					body: JSON.stringify({
						user_id: 'self',
						newUserData: { preferences: { theme: { layoutState: diff } } }
					})
				});
				userThemePrefs.apply({ layoutState: diff as unknown as Record<string, 'full' | 'hidden'> });
			} catch {
				/* silent — layout state save is best-effort */
			}
		}, 2000);
	});

	// Component State
	let loadError = $state<Error | null>(null);

	// ── View Transitions (2026 browser-native page cross-fade) ──────────────
	// SvelteKit's onNavigate lets us wrap navigations in document.startViewTransition
	// so route changes cross-fade natively (compositor-driven, zero JS per frame).
	// Falls back to the CSS/Svelte adminPage transition when unsupported or when
	// prefers-reduced-motion is set. The keyed adminPage wrapper below disables its
	// own fade while a View Transition will run, so the two never double-animate.
	let viewTransitionsEnabled = $state(false);

	onMount(() => {
		const media = window.matchMedia('(prefers-reduced-motion: reduce)');
		const update = () => {
			viewTransitionsEnabled = 'startViewTransition' in document && !media.matches;
		};
		update();
		media.addEventListener('change', update);
		return () => media.removeEventListener('change', update);
	});

	onNavigate((navigation) => {
		if (!viewTransitionsEnabled) return;
		return new Promise((resolve) => {
			try {
				document.startViewTransition(async () => {
					resolve();
					await navigation.complete;
				});
			} catch {
				// Interrupted/aborted navigation — continue without the transition.
				resolve();
			}
		});
	});

	// =============================================
	// DERIVED STATE
	// =============================================

	// seoDescription logic
	const siteName = $derived(data.settings?.siteName || 'SveltyCMS');
	const seoDescription = $derived(
		`${siteName} - a modern, powerful, and easy-to-use CMS powered by SvelteKit. Manage your content with ease & take advantage of the latest web technologies.`
	);

	// =============================================
	// REACTIVE EFFECTS
	// =============================================

	// Sync mode from URL (helps UI store show/hide sidebars even on error pages)
	$effect(() => {
		const isCreate = page.url.searchParams.get('create') === 'true';
		const isEdit = Boolean(page.url.searchParams.get('edit'));

		if (isCreate) {
			setMode('create');
		} else if (isEdit) {
			setMode('edit');
		} else if (page.url.pathname.includes('/mediagallery')) {
			setMode('media');
		}
	});

	// Effect: Handle system language changes
	$effect(() => {
		const lang = locale.systemLanguage;
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

	// 🔥 SYNC: Connect content structure to global stores for sidebar/navigation reactivity
	// (`contentNodes` is the root layout's sanitized flat list — the single owner of the tree,
	// with a fallback to the route's `contentStructure` when the root layout snapshot is empty).
	$effect(() => {
		// Apply layout data synchronously. A delayed dynamic import could resolve after
		// the Collection Builder published a newer DnD draft and overwrite only the
		// sidebar with the older layout snapshot.
		const routeStructure = (page.data as { contentStructure?: ContentNode[] })?.contentStructure;
		const remoteNodes =
			Array.isArray(data.contentNodes) && data.contentNodes.length > 0
				? data.contentNodes
				: Array.isArray(routeStructure) && routeStructure.length > 0
					? routeStructure
					: (data.contentNodes ?? []);
		applyRemoteContentStructure(remoteNodes);
	});

	// =============================================
	// LIFECYCLE HOOKS
	// =============================================

	onMount(() => {
		// Initialize predictive preloading (physics cone + behavioral smart)
		initPredictivePreload();
		initBounceDetector();
		widgets.initialize();
		initializeDarkMode((data as any).themePreference);

		// Primary Mod+K + Gin/Coffee-style Alt+G (same on Windows, Linux, macOS).
		// Both must work while typing — the palette is a global jump target.
		registerHotkey('mod+k', () => ui.toggleGlobalSearch(), {
			description: 'Open global search / command palette',
			enableInInputs: true
		});
		registerHotkey('alt+g', () => ui.toggleGlobalSearch(), {
			description: 'Open global search',
			enableInInputs: true
		});

		registerHotkey(
			'mod+s',
			() => {
				window.dispatchEvent(new CustomEvent('global-save-request'));
			},
			'Save (global)'
		);

		registerHotkey('escape', () => ui.closeGlobalSearch(), 'Close Overlays/Command Palette', false);
	});

	// 🔥 HMR: Prefer surgical contentStore patch; fall back to soft invalidate.
	// Keeps session, consent, and form context. Avoids full layout data refetch when possible.
	if (import.meta.hot) {
		import.meta.hot.on(
			'svelty:content-update',
			async (data?: import('@src/content/content-hmr').ContentHmrPayload) => {
				if (data?.noOp) return;
				try {
					const { applyContentHmrPatch } = await import('@src/content/content-hmr');
					if (applyContentHmrPatch(data)) {
						// Surgical upsert applied — no layout load round-trip
						return;
					}
				} catch {
					// Surgical patch optional — fall back to full content invalidate
				}
				invalidate('app:content');
			}
		);
		// Theme file sync: refresh theme list when /themes/*.json changes
		import.meta.hot.on('svelty:theme-update', () => {
			invalidate('app:content');
		});
	}

	// `onNavigate` (not `beforeNavigate`): a guard can still cancel the navigation, and
	// when it does `afterNavigate` never runs — the loader would stay latched and every
	// `disabled={... || globalLoadingStore.isLoading}` control would remain inert after
	// the user chose "stay on this page". `onNavigate` only fires for navigations that
	// actually proceed.
	onNavigate(({ from, to }) => {
		if (from && to && from.route.id !== to.route.id) {
			globalLoadingStore.startLoading(loadingOperations.navigation);
		}
	});

	afterNavigate(({ to }) => {
		// Mobile sidebar should start hidden by default (user opens via hamburger)
		if (screen.isMobile) ui.state.leftSidebar = 'hidden';

		// Entering an edit/create route on desktop re-opens the inspector even if a
		// previous mobile drawer close marked it as a manual preference.
		const editing = Boolean(
			to?.url.searchParams.has('edit') || to?.url.searchParams.get('create') === 'true'
		);
		if (editing && screen.isDesktop) ui.rightSidebarTouched = false;

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
		<svelte:element this={"style"}>
			{theme.customCss}
		</svelte:element>
	{/if}
</svelte:head>

{#if loadError}
	<div class="flex h-screen w-screen items-center justify-center bg-error-500/10 dark:bg-error-900">
		<div class="text-center">
			<h1 class="text-2xl font-bold text-error-600 dark:text-error-400">
				{applayout_application_error()}
			</h1>
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
			--admin-sidebar-compact-width: 120px;
			--admin-header-height: {theme.headerHeight};
			--admin-sticky-bar-height: {theme.stickyBarHeight};
		"
	>
		{#if ui.isCommandBarVisible}
			<CommandPalette />
		{/if}

		<!-- One global picker: every tokenTarget / fields.svelte trigger writes to activeInput. -->
		<TokenPicker />

		<div class="relative z-0">
			<div class="flex h-lvh flex-col overflow-hidden">
				{#if ui.state.header !== 'hidden'}
					<header
						class="sticky top-0 z-10"
						style="height: var(--admin-header-height, 32px); min-height: 4px;"
					>
						<Slot name="global-toolbar" />
						<AdminZone zone="header" inline={true} />
						<AdminZone zone="toolbar" inline={true} />
					</header>
				{/if}

				<div class="flex flex-1 overflow-hidden">
					<!-- Desktop / tablet: inline sidebar (inside flex flow).
					     `max-md:hidden` matters for SSR: the server cannot know the
					     viewport, so it renders this branch for phones too. Hiding it in
					     CSS means hydration removes nothing that was ever painted. -->
					{#if !screen.isMobile && leftSidebarState !== 'hidden'}
						<aside
							data-testid="app-left-sidebar"
							class="max-md:hidden max-h-dvh shrink-0 bg-surface-500/10 text-center transition-[width] duration-300 ease-in-out dark:bg-surface-900 overflow-visible"
							style="width: {leftSidebarState === 'full'
								? 'var(--admin-sidebar-width, 240px)'
								: 'var(--admin-sidebar-compact-width, 120px)'}"
							aria-label={applayout_left_sidebar_nav()}
						>
							<LeftSidebar />
						</aside>
					{/if}

					<!-- `overflow-x-clip` keeps wide author content (tables, embeds) from
					     painting underneath the end sidebar; vertical scroll stays owned
					     by each route so sticky bars are unaffected. -->
					<main class="relative z-0 flex w-full min-w-0 flex-1 flex-col overflow-x-clip">
						{#if showPageHeader && ui.state.pageheader !== 'hidden'}
							<header class="sticky top-0 z-20 w-full"><HeaderEdit /></header>
						{/if}

						<!-- Standardized page-entry motion for every admin route. Keyed on
					     pathname so only real navigations replay the transition (query
					     params like ?edit / ?create stay put). adminPage respects
					     prefers-reduced-motion and the theme's reducedMotion flag. -->
						<!-- A plugin workspace takes over the content column: the page below
						     is unmounted so its PageTitle cannot paint over the workspace
						     title (two stacked <h1>s) and its content stays out of the a11y
						     tree. `page.data` is untouched, so closing the workspace restores
						     the page without a refetch. -->
						{#if !pluginWorkspace.isOpen}
							{#key page.url.pathname}
								<div
									in:adminPage={{ duration: viewTransitionsEnabled ? 0 : 240, rise: 8 }}
									class="relative flex w-full min-w-0 flex-1 flex-col"
								>
									{@render children?.()}
								</div>
							{/key}
						{/if}

						<!-- Plugin workspaces (Smart Importer, Data Hub) render inside the content
						     column so the shell + sidebars stay available. The overlay is
						     `absolute inset-0` against this `relative` <main>. -->
						<PluginWorkspaceOverlay />

						<!-- Sticky action bar (only rendered when content exists) -->
						{#if !pluginWorkspace.isOpen && theme.features.stickyActionBar && ui.stickyActionContent}
							<div
								class="sticky bottom-0 z-20 w-full border-t border-(--admin-border-default) bg-white/95 dark:bg-surface-900/95 backdrop-blur-md"
								style="min-height: var(--admin-sticky-bar-height, 56px);"
								role="toolbar"
								aria-label={applayout_page_actions()}
								aria-live="polite"
							>
								<div class="flex items-center justify-end gap-2 px-4 py-2 max-md:pe-20">
									{@render ui.stickyActionContent()}
								</div>
							</div>
						{/if}

						{#if !pluginWorkspace.isOpen && showPageFooter}
							<footer
								class="mt-auto w-full bg-surface-500/10 bg-linear-to-b px-1 text-center dark:from-surface-700 dark:to-surface-900 {pageFooterIsFallback
									? 'max-lg:hidden'
									: ''}"
							>
								<PageFooter />
							</footer>
						{/if}
					</main>

					<!-- Desktop: inline right sidebar (hidden below md for the same
					     SSR reason as the left aside; tablets never show it, matching
					     `updateFromContext`). -->
					{#if !screen.isMobile && rightSidebarState !== 'hidden'}
						<aside
							data-testid="app-right-sidebar"
							class="max-md:hidden max-h-dvh w-64 shrink-0 border-s bg-white bg-linear-to-r dark:border-surface-500 dark:from-surface-700 dark:to-surface-900 md:max-lg:hidden"
							aria-label={applayout_right_sidebar()}
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
							class="fixed inset-0 z-40 bg-surface-900/20 backdrop-blur-xs dark:bg-black/50"
							aria-label={applayout_close_left_sidebar()}
							transition:fade={{ duration: 150 }}
							onclick={() => ui.toggle('leftSidebar', 'hidden')}
						></button>
						<!-- Drawer -->
						<div
							class="fixed inset-s-0 top-0 z-50 flex h-dvh max-h-dvh flex-col overflow-visible border-e border-surface-500/30 bg-(--admin-bg-overlay) text-center shadow-lg transition-[width] duration-300 ease-in-out dark:border-surface-500/40"
							style="width: {ui.state.leftSidebar === 'full'
								? 'min(100vw, var(--admin-sidebar-width, 240px))'
								: 'var(--admin-sidebar-compact-width, 120px)'}"
							role="dialog"
							aria-modal="true"
							aria-label={applayout_left_sidebar_nav()}
							transition:adminSlide={{ distance: ui.state.leftSidebar === 'full' ? -240 : -120 }}
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
							class="fixed inset-0 z-40 bg-surface-900/20 backdrop-blur-xs dark:bg-black/50"
							aria-label={applayout_close_right_sidebar()}
							transition:fade={{ duration: 150 }}
							onclick={() => ui.toggle('rightSidebar', 'hidden')}
						></button>
						<!-- Drawer -->
						<div
							class="fixed inset-e-0 top-0 z-50 flex h-dvh max-h-dvh w-[min(100vw,var(--admin-sidebar-width,240px))] flex-col overflow-visible border-s border-surface-500/30 bg-surface-500/10 shadow-lg dark:border-surface-500/40 dark:bg-surface-900"
							role="dialog"
							aria-modal="true"
							aria-label={applayout_right_sidebar()}
							transition:adminSlide={{ distance: 240 }}
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
	</div>
{/if}
