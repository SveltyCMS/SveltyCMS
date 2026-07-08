<!--
@file src/components/left-sidebar.svelte

@component
**LeftSidebar component displaying collection fields, publish options and translation status.**

@example
<LeftSidebar />

#### Props
- `mode` {object} - The current mode object from the mode store
- `collection` {object} - The current collection object from the collection store

#### Features
- Displays collection fields
- Displays publish options
- Displays translation status
- Optimized event handlers
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	// Native UI Components
	import Dropdown from "@components/ui/dropdown.svelte";
	import Collections from '@src/components/collections.svelte';
	import SettingsMenu from '@src/components/settings-menu.svelte';
	import MediaFolders from '@src/components/media-folders.svelte';
	import SiteName from '@src/components/site-name.svelte';
	// Components
	import SveltyCMSLogo from '@src/components/system/icons/svelty-cms-logo.svelte';
	// System Components
	import Slot from '@src/components/system/slot.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import ThemeToggle from '@src/components/theme-toggle.svelte';
	import VersionCheck from '@src/components/version-check.svelte';
	import { modeTransitionGuard } from '@src/stores/mode-transition-guard.svelte';
	import type { ContentNode } from '@src/content/types'; // Import Schema type (collection definition)
	// Paraglide Messages
	import {
		applayout_signout,
		applayout_systemconfiguration,
		applayout_systemlanguage,
		applayout_userprofile,
	} from '@src/paraglide/messages';
	import type { Locale } from '@src/paraglide/runtime';
	import { locales as availableLocales, getLocale } from '@src/paraglide/runtime';
	import { goto } from '$app/navigation';
	// Stores
	import { contentStructure, setMode } from '@src/stores/collection-store.svelte';
	import { ui, uiStateManager, toggleUIElement } from '@src/stores/ui-store.svelte';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import { systemLanguage } from '@src/stores/store.svelte';
	import { themeStore } from '@src/stores/theme-store.svelte';
	import { pinnedStore } from '@src/stores/pinned-store.svelte';
	import { getLanguageName } from '@utils/language-utils';
	import { logger } from '@utils/logger';
		import Avatar from '@components/ui/avatar.svelte';
	// Removed axios import
	import { browser } from '$app/environment';
	// Import necessary utilities and types
	import { page } from '$app/state';
	import { scale, slide } from 'svelte/transition';
	import { getThemeContext } from '@components/ui/theme-context.svelte';


	// Constants
	const MOBILE_BREAKPOINT = 768;
	const LANGUAGE_DROPDOWN_THRESHOLD = 5;
	const AVATAR_CACHE_BUSTER = Date.now();

	// Types
	type AvailableLanguage = string;
	type SidebarState = 'full' | 'collapsed' | 'hidden';

	// Reactive user data
	const user = $derived(page.data.user);
	const currentPath = $derived(page.url.pathname);
	const collections: ContentNode[] = $derived(contentStructure.value || []);
	let searchQuery = $state('');
	// Removed isDropdownOpen and dropdownRef as Menu handles this

	// Collapsible Sidebar Sections State
	let isPinnedOpen = $state(true);
	let isCollectionsOpen = $state(true);
	let isMediaOpen = $state(false);
	let isCollapsedCollectionsOpen = $state(true);
	let collectionSearchQuery = $state('');

	$effect(() => {
		// Context-aware sidebar: sections are route-specific to match user intent.
		// - /mediagallery             → Media only
		// - default (collections)     → Collections only
		if (currentPath.includes('/mediagallery')) {
			isMediaOpen = true;
			isCollectionsOpen = false;
		} else {
			isCollectionsOpen = true;
			isMediaOpen = false;
		}
	});

	// Derived values
	const isSidebarFull = $derived(ui.state.leftSidebar === 'full');

	// Theme-aware: should collections render in this sidebar?
	const themeCtx = getThemeContext();
	const collectionsPosition = $derived(
		themeCtx?.features?.layoutRegions?.collections ?? 'left'
	);
	const showCollectionsHere = $derived(
		collectionsPosition === 'left' || collectionsPosition === 'both'
	);

	const filteredCollapsedCollections = $derived(
		collectionSearchQuery
			? collections.filter((node) =>
					node.name?.toLowerCase().includes(collectionSearchQuery.toLowerCase())
			  )
			: collections
	);

	const firstCollectionPath = $derived.by(() => {
		if (collections?.[0]) {
			const node = collections[0] as any;
			const pathValue = node.path || `/collection/${node._id}`;
			return `/${getLocale()}${pathValue.startsWith("/") ? pathValue : `/${pathValue}`}`;
		}
		return '/collections';
	});

	const availableLanguages = $derived([...availableLocales].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en'))));

	const showLanguageDropdown = $derived(availableLanguages.length > LANGUAGE_DROPDOWN_THRESHOLD);

	let languageTag = $state<Locale>('en' as Locale);

	const filteredLanguages = $derived(
		availableLanguages
			.filter((lang) => lang !== languageTag) // Hide current language
			.filter((lang: string) => {
				const searchLower = searchQuery.toLowerCase();
				const systemLangName = getLanguageName(lang, systemLanguage.value).toLowerCase();
				const enLangName = getLanguageName(lang, 'en').toLowerCase();
				return systemLangName.includes(searchLower) || enLangName.includes(searchLower);
			}) as AvailableLanguage[]
	);

	const avatarUrl = $derived.by(() => {
		let src = user?.avatar;
		if (!src || src === 'Default_User.svg' || src === '/Default_User.svg') {
			return '/Default_User.svg';
		}
		if (src.startsWith('data:')) {
			return src;
		}

		// Normalize path
		src = src.replace(/^\/+/, '');
		src = src.replace(/^mediaFolder\//, '').replace(/^files\//, '');
		src = src.replace(/^\/+/, '');

		return `/files/${src}?t=${AVATAR_CACHE_BUSTER}`;
	});

	const themeTooltipText = $derived.by(() => {
		const current = themeStore.themePreference;
		if (current === 'system') {
			return 'System theme (click for Light)';
		}
		if (current === 'light') {
			return 'Light theme (click for Dark)';
		}
		return 'Dark theme (click for System)';
	});

	// Helper functions
	function isMobile(): boolean {
		return browser && window.innerWidth < MOBILE_BREAKPOINT;
	}


	// Event handlers
	function handleLanguageSelection(lang: AvailableLanguage): void {
		systemLanguage.set(lang as Locale);
		languageTag = lang as Locale;
		searchQuery = '';
	}

	// Unused settings helper removed

	function toggleSidebar(): void {
		const newState: SidebarState = ui.state.leftSidebar === 'full' ? 'collapsed' : 'full';
		toggleUIElement('leftSidebar', newState);
	}

	function handleUserClick(): void {
		if (isMobile()) {
			toggleUIElement('leftSidebar', 'hidden');
		}
		modeTransitionGuard.setMode('view');
	}

	function handleConfigClick(): void {
		if (isMobile()) {
			toggleUIElement('leftSidebar', 'hidden');
		}
		modeTransitionGuard.setMode('view');
	}

	async function signOut(): Promise<void> {
		try {
			let res = await fetch('/api/user/logout', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRF-Token': page.data.csrfToken
				}
			});
			if (!res.ok && res.status === 403) {
				await invalidateAll();
				await new Promise(r => setTimeout(r, 100));
				await fetch('/api/user/logout', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-CSRF-Token': page.data.csrfToken
					}
				});
			}
		} catch (error) {
			logger.error('Error during sign-out:', error instanceof Error ? error.message : 'Unknown error');
		} finally {
			if (browser) window.location.href = '/login';
		}
	}

	function handleCollectionsClick(): void {
		isCollectionsOpen = !isCollectionsOpen;
		if (isCollectionsOpen) {
			isMediaOpen = false;
		}
		if (collections.length === 0) {
			goto('/config/collectionbuilder');
		} else {
			goto(firstCollectionPath);
		}
	}

	$effect(() => {
		if (firstCollectionPath === undefined) return;
	});
</script>

<div class="sidebar-root flex h-full w-full flex-col justify-between bg-transparent">
	<!-- Corporate Identity -->
	{#if isSidebarFull}
		<a href="/" aria-label="SveltyCMS Logo" class="-ms-2 flex items-center pt-1 no-underline!" data-sveltekit-preload-data="hover">
			<SveltyCMSLogo fill="red" className="h-9" />
			<span class="base-font-color relative -ms-1 text-2xl font-bold"><SiteName siteName={publicEnv.SITE_NAME} highlight="CMS" /></span>
		</a>
	{:else}
		<div class="flex justify-center pt-2">
			<a href="/" aria-label="SveltyCMS Logo" class="flex justify-center no-underline!">
				<SveltyCMSLogo fill="red" className="h-9" />
			</a>
		</div>
	{/if}

	<!-- Expand/Collapse Button -->
	<SystemTooltip
		title={isSidebarFull ? 'Collapse Sidebar' : 'Expand Sidebar'}
		positioning={{ placement: 'end' }}
		triggerClass="absolute top-2 z-20 ltr:-end-4 rtl:-start-4"
	>
		<Button variant="ghost"
			type="button"
			onclick={toggleSidebar}
			aria-label={isSidebarFull ? 'Collapse Sidebar' : 'Expand Sidebar'}
			aria-expanded={isSidebarFull}
			class="flex h-10 w-10 items-center justify-center rounded-full! border border-black p-0! min-w-0 dark:border-white"
		>
			<iconify-icon
				icon="bi:arrow-left"
				width="28"
				class="text-surface-700 dark:text-surface-200 transition-transform {isSidebarFull
					? 'rotate-0 rtl:rotate-180'
					: 'rotate-180 rtl:rotate-0'}"
			></iconify-icon>
			</Button>
		</SystemTooltip>

	{#if !isSidebarFull}
		<SystemTooltip
			title="Hide Sidebar"
			positioning={{ placement: 'right' }}
			triggerClass="absolute top-14 z-20 ltr:-end-6 rtl:-start-6"
		>
			<Button variant="ghost"
				type="button"
				onclick={() => toggleUIElement('leftSidebar', 'hidden')}
				aria-label="Hide Sidebar"
				class="flex h-10 w-10 items-center justify-center rounded-full! border border-surface-400 p-0! min-w-0 dark:border-surface-500"
			>
				<iconify-icon icon="bi:list" width="28" class="text-surface-700 dark:text-surface-200"></iconify-icon>
			</Button>
		</SystemTooltip>
	{/if}

	<!-- Navigation: Collapsible Sections -->
	<div
		class="flex-1 pe-1 {isSidebarFull ? 'space-y-4 my-4' : 'space-y-2 my-2'} max-h-[calc(100vh-220px)] navigation-scroll-container overflow-x-hidden {ui.routeContext.isSystemSettings
			? 'overflow-y-hidden flex flex-col'
			: 'overflow-y-auto'}"
	>
		{#if ui.routeContext.isSystemSettings}
			<SettingsMenu isFullSidebar={isSidebarFull} />
		{:else}
			<!-- 1. Pinned Items -->
			{#if pinnedStore.items.length > 0}
				<div class="space-y-1">
					<Button variant="ghost"
						type="button"
						onclick={() => isPinnedOpen = !isPinnedOpen}
						class="flex w-full items-center justify-between py-1.5 text-xs font-bold uppercase tracking-wider rounded bg-surface-50/40 dark:bg-surface-800/20 hover:bg-surface-100/80 dark:hover:bg-surface-700/50 {isSidebarFull ? 'px-1' : 'justify-center'}"
					 aria-label="Toggle pinned items">
						<span class="flex items-center gap-1.5">
							<iconify-icon icon="bi:pin-angle-fill" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							{#if isSidebarFull}Pinned{/if}
						</span>
						{#if isSidebarFull}
							<iconify-icon
							icon="bi:chevron-down"
							width="16"
							class="transform transition-transform duration-200 {isPinnedOpen ? '' : '-rotate-90'}"
						></iconify-icon>
						{/if}
					</Button>

					{#if isPinnedOpen}
						<div class="space-y-0.5" transition:scale={{ duration: 150, start: 0.95 }}>
							{#each pinnedStore.items as item (item.id)}
								<div class="group relative flex items-center justify-between rounded hover:bg-surface-100/50 dark:hover:bg-surface-500/20">
									<a
										href={item.path}
										data-sveltekit-preload-data="hover"
										class="flex flex-1 items-center gap-2 px-2 py-2 text-sm text-surface-900 dark:text-surface-100 no-underline!"
										onclick={() => {
											if (isMobile()) toggleUIElement('leftSidebar', 'hidden');
										}}
									>
										<iconify-icon icon={item.icon || 'bi:pin'} width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
										{#if isSidebarFull}
											<span class="truncate">{item.name}</span>
										{/if}
									</a>
									{#if isSidebarFull}
										<Button variant="ghost"
											type="button"
											onclick={() => pinnedStore.unpin(item.id)}
											title="Unpin"
										aria-label="Unpin" class="-xs rounded-full p-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-surface-200 dark:hover:bg-surface-800">
											<iconify-icon icon="bi:x" width="20" class="text-surface-500"></iconify-icon>
										</Button>
									{/if}
								</div>
							{/each}
						</div>
					{/if}
				</div>
				<div class="mx-1 border-0 border-t border-surface-200/30 dark:border-surface-700/30"></div>
			{/if}

			<!-- 2. Collections -->
			{#if isSidebarFull}
			<div class="space-y-1">
				{#if !currentPath.includes('/collection/')}
					<Button variant="ghost"
						type="button"
						onclick={handleCollectionsClick}
						class="flex w-full items-center justify-between py-2 text-xs font-bold uppercase tracking-wider rounded bg-surface-50/40 dark:bg-surface-800/20 hover:bg-surface-100/80 dark:hover:bg-surface-700/50 px-2"
					 aria-label="Toggle collections">
						<span class="flex items-center gap-1.5">
							<iconify-icon icon="bi:collection" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							Collections
						</span>
						<iconify-icon
							icon="bi:chevron-down"
							width="16"
							class="transform transition-transform duration-200 {isCollectionsOpen ? '' : '-rotate-90'}"
						></iconify-icon>
					</Button>
				{/if}
				{#if isCollectionsOpen && showCollectionsHere}
					<div class="px-1">
						<Collections />
					</div>
				{/if}
			</div>
			<div class="mx-1 border-0 border-t border-surface-200/50 dark:border-surface-700/50"></div>
			{/if}

			<!-- 3. Collapsed collection icons (collapsible button + expandable list) -->
			{#if !isSidebarFull && showCollectionsHere && collections.length > 0}
				<div class="flex flex-col items-center gap-1 px-1 pt-2 border-0 border-t border-surface-200/30 dark:border-surface-700/30">
					<button
						onclick={() => { isCollapsedCollectionsOpen = !isCollapsedCollectionsOpen; goto('/config/collectionbuilder'); }}
						class="flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200 text-[#68E818] hover:bg-[#68E818]/10"
						aria-label="Manage collections"
					>
						<iconify-icon icon="bi:collection" width="20" class="text-[#68E818]"></iconify-icon>
					</button>
					<button
						onclick={() => isCollapsedCollectionsOpen = !isCollapsedCollectionsOpen}
						class="flex h-5 w-5 items-center justify-center rounded transition-all duration-200 text-[#68E818] hover:bg-[#68E818]/10"
						aria-label="Expand collections"
					>
						<iconify-icon
							icon="bi:chevron-down"
							width="12"
							class="text-[#68E818] transform transition-transform duration-200 {isCollapsedCollectionsOpen ? '' : '-rotate-90'}"
						></iconify-icon>
					</button>
					{#if isCollapsedCollectionsOpen}
						<div class="flex flex-col items-center gap-1" transition:slide={{ duration: 200 }}>
							<button
								onclick={() => toggleUIElement('leftSidebar', 'full')}
								class="flex h-8 w-8 items-center justify-center rounded-lg transition-all duration-200 text-[#68E818] hover:bg-[#68E818]/10"
								aria-label="Search collections"
							>
								<iconify-icon icon="bi:search" width="16" class="text-[#68E818]"></iconify-icon>
							</button>
							{#each filteredCollapsedCollections as node (node._id)}
								{@const collectionPath = `/${getLocale()}${node.path || `/${node._id}`}`}
								<SystemTooltip title={node.name} positioning={{ placement: 'right' }}>
									<a
										href={collectionPath}
										data-sveltekit-preload-data="hover"
										onclick={() => {
											if (isMobile()) toggleUIElement('leftSidebar', 'hidden');
										}}
										class="flex h-9 w-9 items-center justify-center rounded-lg transition-all duration-200 {page.url.pathname === collectionPath ? 'text-[#CF0100] bg-[#CF01001a] border border-[#CF010026] shadow-sm' : 'text-[#CF0100cc] hover:bg-[#CF010015]'}"
										aria-label={node.name}
									>
										<iconify-icon
											icon={node.icon || 'bi:collection'}
											width="20"
											class="text-[#CF0100]"
										></iconify-icon>
									</a>
								</SystemTooltip>
							{/each}
						</div>
					{/if}
				</div>
			{/if}

			<!-- 4. Media Gallery -->
			<div class="space-y-1">
				{#if currentPath.includes('/mediagallery') && isSidebarFull}
					<div class="px-1">
						<MediaFolders />
					</div>
				{:else}
					<Button variant="ghost"
						type="button"
						onclick={() => {
							goto('/mediagallery');
							if (isMobile()) {
								toggleUIElement('leftSidebar', 'collapsed');
							}
						}}
						class="flex w-full items-center justify-between py-2 text-xs font-bold uppercase tracking-wider rounded {isSidebarFull ? 'px-2' : 'justify-center'}"
					>
						<span class="flex items-center gap-1.5">
							<iconify-icon icon="bi:images" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
							{#if isSidebarFull}Media Gallery{/if}
						</span>
						{#if isSidebarFull}
							<iconify-icon
								icon="bi:chevron-down"
								width="16"
								class="transform transition-transform duration-200 {isMediaOpen ? '' : '-rotate-90'}"
							></iconify-icon>
						{/if}
					</Button>
					{#if isMediaOpen}
						<div class="px-1 space-y-2">
							{#if isSidebarFull && !currentPath.includes('/mediagallery')}
								<a
									href="/mediagallery"
									data-sveltekit-preload-data="hover"
									class="flex items-center gap-2 rounded px-3 py-2 text-xs font-semibold text-tertiary-500 dark:text-primary-500 bg-tertiary-500/10 hover:bg-tertiary-500/20 dark:bg-primary-500/10 hover:dark:bg-primary-500/20 no-underline! transition-colors"
									onclick={() => {
										if (isMobile()) toggleUIElement('leftSidebar', 'collapsed');
									}}
								>
									<iconify-icon icon="bi:images" width="18"></iconify-icon>
									Open Media Gallery
								</a>
							{/if}
							<MediaFolders />
						</div>
					{/if}
				{/if}
			</div>
		{/if}
	</div>

	<!-- Collapsed footer icons (outside navigation container) -->
	{#if !isSidebarFull}
		<div class="w-full px-1 mb-2 mt-auto pt-4 border-0 border-t border-surface-200/30 dark:border-surface-700/30">
			<div class="flex flex-col items-center gap-2">
				<!-- User Profile -->
				<div class="flex items-center justify-center">
					<SystemTooltip title={applayout_userprofile()} positioning={{ placement: 'right' }}>
						<a href="/user" onclick={handleUserClick} aria-label="User Profile" class="flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-500/20 no-underline!">
							<Avatar src={avatarUrl} alt="User Avatar" size="size-10" rounded="rounded-full" class="mx-auto" />
						</a>
					</SystemTooltip>
				</div>

				<!-- Theme Toggle -->
				<div class="flex items-center justify-center">
					<SystemTooltip title={themeTooltipText} positioning={{ placement: 'right' }}>
						<div class="flex items-center justify-center">
							<ThemeToggle showTooltip={false} buttonClass="btn-icon rounded-full hover:bg-surface-300/20 dark:hover:bg-surface-700/40" iconSize={28} />
						</div>
					</SystemTooltip>
				</div>

				<!-- Sign Out -->
				<div class="flex items-center justify-center">
					<SystemTooltip title={applayout_signout()} positioning={{ placement: 'right' }}>
						<Button variant="ghost" onclick={signOut} type="button" aria-label="Sign Out" data-testid="sign-out-button" class="flex h-10 w-10 items-center justify-center rounded-full p-0! min-w-0">
							<iconify-icon icon="uil:signout" width="28"></iconify-icon>
						</Button>
					</SystemTooltip>
				</div>

				<!-- Language Selector -->
				<div class="flex items-center justify-center px-1">
					<SystemTooltip title={applayout_systemlanguage()} positioning={{ placement: 'right' }}>
						<div class="language-selector relative" data-testid="language-selector">
							<Dropdown position="right-start" class="w-56">
								{#snippet trigger()}
									<Button
										variant="surface"
										rounded
										aria-label="Select language"
										class="mb-3 flex items-center justify-center uppercase hover:bg-surface-400 h-11 w-11 text-xs font-semibold"
									>
										{languageTag}
									</Button>
								{/snippet}
								<div class="px-3 py-2 text-xs font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider text-center border-b border-surface-200 dark:border-surface-50 mb-1">
									{applayout_systemlanguage()}
								</div>
								{#if showLanguageDropdown}
									<div class="px-2 pb-2 mb-1 border-b border-surface-200 dark:border-surface-50">
										<input type="text" bind:value={searchQuery} placeholder="Search language..." class="w-full rounded bg-surface-200 dark:bg-surface-800 px-3 py-2 text-sm placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-surface-900 dark:text-white border-none" aria-label="Search languages" onclick={(e) => e.stopPropagation()} />
									</div>
									<div class="max-h-64 divide-y divide-surface-200 dark:divide-surface-700 overflow-y-auto">
										{#each filteredLanguages as lang (lang)}
											<button class="w-full text-start px-3 py-2 flex items-center justify-between rounded-sm cursor-pointer hover:bg-surface-200/50 dark:hover:bg-surface-800/50 text-surface-900 dark:text-surface-200" onclick={() => handleLanguageSelection(lang)}>
												<span class="text-sm font-medium text-surface-900 dark:text-surface-200">{getLanguageName(lang)}</span>
												<span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ms-2">{lang.toUpperCase()}</span>
											</button>
										{/each}
									</div>
								{:else}
									{#each availableLanguages.filter((l) => l !== languageTag) as lang (lang)}
										<button class="w-full text-start px-3 py-2 flex items-center justify-between rounded-sm cursor-pointer hover:bg-surface-200/50 dark:hover:bg-surface-800/50 text-surface-900 dark:text-surface-200" onclick={() => handleLanguageSelection(lang)}>
											<span class="text-sm font-medium">{getLanguageName(lang)}</span>
											<span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ms-2">{lang.toUpperCase()}</span>
										</button>
									{/each}
								{/if}
							</Dropdown>
						</div>
					</SystemTooltip>
				</div>

				<!-- Config -->
				<div class="flex items-center justify-center">
					<SystemTooltip title={applayout_systemconfiguration()} positioning={{ placement: 'right' }}>
						<Button variant="ghost" href="/config" data-sveltekit-preload-data="hover" onclick={handleConfigClick} aria-label="System Configuration" class="flex h-10 w-10 items-center justify-center rounded-full p-0! min-w-0">
							<iconify-icon icon="material-symbols:build-circle" width="28"></iconify-icon>
						</Button>
					</SystemTooltip>
				</div>
			</div>
		</div>
		{/if}

	<!-- Plugin Sidebar Items -->
	<div class="mt-2 w-full px-1"><Slot name="sidebar" /></div>
	<!-- Footer (expanded only) -->
	{#if isSidebarFull}
	<div class="mb-2 mt-auto w-full px-1">
		<div class="mx-1 mb-2 border-0 border-t border-surface-300 dark:border-surface-600"></div>

		<div class="grid w-full items-center justify-center gap-0.5 text-surface-700 dark:text-surface-200 grid-cols-3">
			<!-- Avatar -->
			<div class="{isSidebarFull ? 'order-1 row-span-2' : 'order-1'} flex items-center justify-center">
				<SystemTooltip title={applayout_userprofile()} positioning={{ placement: 'right' }}>
					<a
						href="/user"
						data-sveltekit-preload-data="hover"
						onclick={handleUserClick}
						aria-label="User Profile"
						class="flex w-full flex-col items-center justify-center rounded p-2 hover:bg-surface-500/20 relative flex items-center justify-center text-center no-underline!"
						>
							<Avatar src={avatarUrl} alt="User Avatar" size="size-12" rounded="rounded-full" class="mx-auto" />
					</a>
				</SystemTooltip>
			</div>

 			<!-- Theme Toggle -->
 			<div class="{isSidebarFull ? 'order-2' : 'order-2'} flex items-center justify-center">
 				<SystemTooltip title={themeTooltipText} positioning={{ placement: 'right' }}>
 					<!-- Wrapper div needed because ThemeToggle might not forward all events/props or to serve as reliable trigger anchor -->
 					<div class="flex items-center justify-center">
						<ThemeToggle showTooltip={false} buttonClass="btn-icon  rounded-full hover:bg-surface-300/20" iconSize={28} />
 					</div>
 				</SystemTooltip>
 			</div>

 			<!-- Language Selector -->
 			<div class="{isSidebarFull ? 'order-3 row-span-2' : 'order-4'} flex items-center justify-center px-1">
 				<SystemTooltip title={applayout_systemlanguage()} positioning={{ placement: 'right' }}>
					<div class="language-selector relative" data-testid="language-selector">
						<Dropdown position="right-start" class="w-56">
							{#snippet trigger()}
								<Button
									variant="surface"
									rounded
									aria-label="Select language"
									class="mb-3 flex items-center justify-center uppercase hover:bg-surface-400 h-12 w-12 text-xs font-semibold"
								>
									{languageTag}
								</Button>
							{/snippet}

							<div class="px-3 py-2 text-xs font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider text-center border-b border-surface-200 dark:border-surface-50 mb-1">
 								{applayout_systemlanguage()}
 							</div>

 							{#if showLanguageDropdown}
 								<div class="px-2 pb-2 mb-1 border-b border-surface-200 dark:border-surface-50">
 									<input type="text" bind:value={searchQuery} placeholder="Search language..." class="w-full rounded bg-surface-200 dark:bg-surface-800 px-3 py-2 text-sm placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-surface-900 dark:text-white border-none" aria-label="Search languages" onclick={(e) => e.stopPropagation()} />
 								</div>
 								<div class="max-h-64 divide-y divide-surface-200 dark:divide-surface-700 overflow-y-auto">
 									{#each filteredLanguages as lang (lang)}
 										<button class="w-full text-start px-3 py-2 flex items-center justify-between rounded-sm cursor-pointer hover:bg-surface-200/50 dark:hover:bg-surface-800/50 text-surface-900 dark:text-surface-200" onclick={() => handleLanguageSelection(lang)}>
 											<span class="text-sm font-medium text-surface-900 dark:text-surface-200">{getLanguageName(lang)}</span>
 											<span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ms-2">{lang.toUpperCase()}</span>
 										</button>
 									{/each}
 								</div>
 							{:else}
 								{#each availableLanguages.filter((l) => l !== languageTag) as lang (lang)}
 									<button class="w-full text-start px-3 py-2 flex items-center justify-between rounded-sm cursor-pointer hover:bg-surface-200/50 dark:hover:bg-surface-800/50 text-surface-900 dark:text-surface-200" onclick={() => handleLanguageSelection(lang)}>
 										<span class="text-sm font-medium">{getLanguageName(lang)}</span>
 										<span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ms-2">{lang.toUpperCase()}</span>
 									</button>
 								{/each}
 							{/if}
 						</Dropdown>
 					</div>
 				</SystemTooltip>
 			</div>

			<!-- Sign Out -->
			<div class="{isSidebarFull ? 'order-4' : 'order-3'} flex items-center justify-center">
				<SystemTooltip title={applayout_signout()} positioning={{ placement: 'right' }}>
					<Button variant="ghost" onclick={signOut} type="button" aria-label="Sign Out" data-testid="sign-out-button" class="flex h-12 w-12 items-center justify-center rounded-full p-0! min-w-0">
						<iconify-icon icon="uil:signout" width="32" class=""></iconify-icon>
					</Button>
				</SystemTooltip>
			</div>

 			<!-- Config -->
 			<div class="{isSidebarFull ? 'order-5' : 'order-6'} flex items-center justify-center">
 				<SystemTooltip title={applayout_systemconfiguration()} positioning={{ placement: 'right' }}>
					<a
						href="/config"
						data-sveltekit-preload-data="hover"
						onclick={handleConfigClick}
						aria-label="System Configuration"
						class="flex items-center justify-center rounded-full hover:bg-surface-500/20"
					>
						<iconify-icon icon="material-symbols:build-circle" width="35" class=""></iconify-icon>
 					</a>
 				</SystemTooltip>
 			</div>

 			<!-- Version -->
 			<div class="{isSidebarFull ? 'order-6' : 'order-5'} flex items-center justify-center"><VersionCheck compact={true} /></div>

			<!-- Community Links (only when expanded) -->
				<div class="order-7 flex items-center justify-center gap-1">
					<SystemTooltip title="Discord Community" positioning={{ placement: 'right' }}>
						<a
							href="https://discord.gg/VrvZF6e2sC"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="Discord Community"
							class="flex h-12 w-12 items-center justify-center rounded-full hover:bg-surface-500/20"
						>
							<iconify-icon icon="ic:baseline-discord" width="32" class=""></iconify-icon>
						</a>
					</SystemTooltip>
				</div>
		</div>
	</div>
	{/if}
</div>
<style>
	/* Sidebar width follows admin theme token (applied on layout aside) */
	:global(aside[aria-label='Left sidebar navigation']) {
		transition: width var(--admin-motion-duration, 300ms) ease-in-out;
	}

	.sidebar-root {
		max-width: var(--admin-sidebar-width, 240px);
	}

	/* Navigation scroll container */
	.navigation-scroll-container {
		scrollbar-color: rgb(var(--color-surface-500) / 0.3) transparent;
		scrollbar-width: thin;
	}

	.navigation-scroll-container::-webkit-scrollbar {
		width: 4px;
	}

	.navigation-scroll-container::-webkit-scrollbar-track {
		background: transparent;
	}

	.navigation-scroll-container::-webkit-scrollbar-thumb {
		background-color: rgb(var(--color-surface-500) / 0.3);
		border-radius: 2px;
	}

	.navigation-scroll-container::-webkit-scrollbar-thumb:hover {
		background-color: rgb(var(--color-surface-500) / 0.5);
	}

	/* Smooth transitions for sidebar interactive elements */
	.sidebar-root a,
	.sidebar-root button {
		transition: background-color 150ms ease, color 150ms ease;
	}
</style>
