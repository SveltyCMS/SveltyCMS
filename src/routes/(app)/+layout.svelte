<!--
@file src/routes/(app)/+layout.svelte
@component
**Authenticated Admin Layout**: Wraps all core CMS views (Collections, Media, User Settings).

This layout provides the administrative shell, including sidebars and header controls.

### Responsibilities:
- Managing admin-specific UI state (Sidebar expansion, Mode switching).
- Initializing Widgets and Theme in the authenticated context.
- Providing navigation guards and auto-save draft functionality.

### Next Steps & Options:
- Expand/Collapse sidebars for more horizontal space.
- Use Command Bar (Mod+K) for quick navigation.
- Switch between Content (Collections) and Media Gallery modes.
-->

<script lang="ts">
import FloatingChat from "@src/components/collaboration/floating-chat.svelte";
import FloatingNav from "@src/components/system/floating-nav.svelte";
import HeaderEdit from "@src/components/header-edit.svelte";
import LeftSidebar from "@src/components/left-sidebar.svelte";
import PageFooter from "@src/components/page-footer.svelte";
import RightSidebar from "@src/components/right-sidebar.svelte";
import SearchComponent from "@src/components/search-component.svelte";
// Type Imports
import type { User } from "@src/databases/auth/types";
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
// Utils
import { isSearchVisible } from "@utils/global-search-index";
import { getTextDirection } from "@utils/utils";
import { onMount, untrack } from "svelte";
import { registerHotkey } from "@src/utils/hotkeys";
import CommandBar from "@src/components/command-bar.svelte";
// SvelteKit Navigation
import { afterNavigate, beforeNavigate } from "$app/navigation";
import { page } from "$app/state";
import type { Schema, ContentNode } from "../../content/types";
import { setContentContext } from "@src/content";

// =============================================
// TYPE DEFINITIONS
// =============================================

interface LayoutData {
	contentStructure: Promise<ContentNode[]>;
	firstCollection: Promise<Schema | null>;
	settings: Record<string, any>;
	user: User | null;
	tenantId?: string | null;
	darkMode: boolean;
	nonce: string;
	theme: import("@src/databases/db-interface").Theme;
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
// EVENT HANDLERS
// =============================================

// Initialize avatar from user data
function initializeUserAvatar(user: User | null): void {
	console.log(
		"[AppLayout] initializeUserAvatar for user:",
		user?.username || "Guest",
	);
	if (!user) {
		app.avatarSrc = "/Default_User.svg";
		return;
	}

	if (user.avatar && user.avatar !== "/Default_User.svg") {
		app.avatarSrc = user.avatar;
	} else {
		app.avatarSrc = "/Default_User.svg";
	}
	console.log("[AppLayout] Avatar source set to:", app.avatarSrc);
}

// =============================================
// LIFECYCLE HOOKS
// =============================================

onMount(() => {
	console.log("[AppLayout] Mounted. User:", data.user?.username || "None");


	widgets.initialize();
	initializeDarkMode(data.theme as any);
	initializeUserAvatar(data.user);

	registerHotkey(
		"mod+k",
		() => {
			ui.isCommandBarVisible = !ui.isCommandBarVisible;
		},
		"Open command palette (AI-powered)",
	);

	registerHotkey(
		"mod+s",
		() => {
			window.dispatchEvent(new CustomEvent("global-save-request"));
		},
		"Save (global)",
	);

	registerHotkey(
		"escape",
		() => {
			ui.isCommandBarVisible = false;
			isSearchVisible.set(false);
		},
		"Close Overlays/Command Palette",
		false,
	);
});

beforeNavigate(({ from, to }) => {
	if (from && to && from.route.id !== to.route.id) {
		globalLoadingStore.startLoading(loadingOperations.navigation);
	}
});

afterNavigate(() => {
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
			<p class="mt-2 text-error-500 dark:text-error-500">{loadError.message}</p>
		</div>
	</div>
{:else}
	<div class="relative h-lvh w-full">
		{#if $isSearchVisible}
			<SearchComponent />
		{/if}

		{#if ui.isCommandBarVisible}
			<CommandBar />
		{/if}

		<div class="flex h-lvh flex-col overflow-hidden">
			{#if ui.state.header !== 'hidden'}
				<header class="sticky top-0 z-10 bg-tertiary-500"></header>
			{/if}

			<div class="flex flex-1 overflow-hidden">
				{#if ui.state.leftSidebar !== 'hidden'}
					<aside
						class="max-h-dvh {ui.state.leftSidebar === 'full'
							? 'w-60'
							: 'w-fit'} relative border-r bg-white px-2! text-center dark:border-surface-500 dark:bg-linear-to-r dark:from-surface-700 dark:to-surface-900"
						aria-label="Left sidebar navigation"
					>
						<LeftSidebar />
					</aside>
				{/if}

				<main class="relative z-0 flex w-full min-w-0 flex-1 flex-col">
					{#if ui.state.pageheader !== 'hidden'}
						<header class="sticky top-0 z-20 w-full"><HeaderEdit /></header>
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
						class="max-h-dvh w-60 border-l bg-white bg-linear-to-r dark:border-surface-500 dark:from-surface-700 dark:to-surface-900"
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

		{#if screen.isMobile}
			<Portal>
				<FloatingNav />
			</Portal>
		{/if}

		{#if data.user}
			<Portal>
				<FloatingChat />
			</Portal>
		{/if}
	</div>
{/if}
