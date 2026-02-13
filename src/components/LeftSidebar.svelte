<!--
@file src/components/LeftSidebar.svelte

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
	import { goto } from '$app/navigation';
	import axios from 'axios';
	import { browser } from '$app/environment';
	import { logger } from '@utils/logger';

	// Import necessary utilities and types
	import { page } from '$app/state';
	import type { ContentNode } from '@src/content/types'; // Import Schema type (collection definition)
	import type { Locale } from '@src/paraglide/runtime';
	import { locales as availableLocales, getLocale } from '@src/paraglide/runtime';
	import { getLanguageName } from '@utils/languageUtils';

	// Stores
	import { setMode, contentStructure } from '@stores/collectionStore.svelte';
	import { avatarSrc, systemLanguage } from '@stores/store.svelte';
	import { toggleUIElement, uiStateManager, userPreferredState } from '@stores/UIStore.svelte';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';
	import { themeStore } from '@stores/themeStore.svelte';

	// Import components
	import VersionCheck from '@components/VersionCheck.svelte';
	import Collections from '@components/Collections.svelte';
	import MediaFolders from '@components/MediaFolders.svelte';
	import SettingsMenu from '@components/SettingsMenu.svelte';
	import SiteName from '@components/SiteName.svelte';
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import ThemeToggle from '@components/ThemeToggle.svelte';

	// Plugin Slots
	import Slot from '@components/system/Slot.svelte';

	// Skeleton components
	import { Avatar, Menu, Portal } from '@skeletonlabs/skeleton-svelte';

	import SystemTooltip from '@components/system/SystemTooltip.svelte';

	// Language and messaging
	import * as m from '@src/paraglide/messages';

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
	// Check if we're in media mode
	const isMediaMode = $derived(currentPath.includes('/mediagallery'));
	// Check if we're in settings mode
	const isSettingsMode = $derived(currentPath.includes('/config/systemsetting'));

	// Language state
	let languageTag = $state(getLocale() as AvailableLanguage);
	let searchQuery = $state('');
	// Removed isDropdownOpen and dropdownRef as Menu handles this

	// Derived values
	const isSidebarFull = $derived(uiStateManager.uiState.value.leftSidebar === 'full');

	const firstCollectionPath = $derived.by(() => {
		if (collections?.[0]) {
			const node = collections[0] as any;
			return node.path ? `/${getLocale()}${node.path}` : `/Collections/${node.name}`;
		}
		return '/Collections';
	});

	const availableLanguages = $derived([...availableLocales].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en'))));

	const showLanguageDropdown = $derived(availableLanguages.length > LANGUAGE_DROPDOWN_THRESHOLD);

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
		let src = avatarSrc.value;
		if (!src || src === 'Default_User.svg' || src === '/Default_User.svg') return '/Default_User.svg';
		if (src.startsWith('data:')) return src;

		// Normalize path
		// 1. Remove leading slashes
		src = src.replace(/^\/+/, '');
		// 2. Remove prefixes
		src = src.replace(/^mediaFolder\//, '').replace(/^files\//, '');
		// 3. Remove leading slashes again just in case
		src = src.replace(/^\/+/, '');

		return `/files/${src}?t=${AVATAR_CACHE_BUSTER}`;
	});

	const themeTooltipText = $derived.by(() => {
		const current = themeStore.themePreference;
		if (current === 'system') return 'System theme (click for Light)';
		if (current === 'light') return 'Light theme (click for Dark)';
		return 'Dark theme (click for System)';
	});

	// Helper functions
	function isMobile(): boolean {
		return browser && window.innerWidth < MOBILE_BREAKPOINT;
	}

	async function navigateTo(path: string): Promise<void> {
		if (currentPath === path) return;

		if (isMobile()) {
			toggleUIElement('leftSidebar', 'hidden');
		}

		setMode('view');

		// Start loading state for navigation
		globalLoadingStore.startLoading(loadingOperations.navigation, `LeftSidebar.navigateTo(${path})`);

		try {
			// Special handling: System routes that don't use language prefixes
			const unlocalizedRoutes = ['/mediagallery', '/config', '/user', '/dashboard', '/setup'];
			const isUnlocalized = unlocalizedRoutes.some((r) => path === r || path.startsWith(r + '/'));

			if (isUnlocalized) {
				await goto(path, { replaceState: false });
				return;
			}

			// Ensure path includes language prefix for collection routes
			const currentLocale = getLocale();
			const pathWithLanguage = path.startsWith(`/${currentLocale}`) ? path : `/${currentLocale}${path}`;

			await goto(pathWithLanguage, { replaceState: false });
		} finally {
			// Stop loading after navigation completes
			// Note: SvelteKit will handle the actual page load, this just shows initial navigation
			setTimeout(() => {
				globalLoadingStore.stopLoading(loadingOperations.navigation);
			}, 100);
		}
	}

	// Event handlers
	function handleLanguageSelection(lang: AvailableLanguage): void {
		systemLanguage.set(lang as Locale);
		languageTag = lang;
		searchQuery = '';
	}

	function toggleSidebar(): void {
		const current = uiStateManager.uiState.value.leftSidebar;
		const newState: SidebarState = current === 'full' ? 'collapsed' : 'full';
		toggleUIElement('leftSidebar', newState);
		userPreferredState.set(newState);
	}

	async function handleUserClick(event?: Event): Promise<void> {
		event?.stopPropagation();
		await navigateTo('/user');
	}

	async function handleConfigClick(event?: Event): Promise<void> {
		event?.stopPropagation();
		await navigateTo('/config');
	}

	async function signOut(): Promise<void> {
		try {
			await axios.post('/api/user/logout', {}, { withCredentials: true });
		} catch (error) {
			logger.error('Error during sign-out:', error instanceof Error ? error.message : 'Unknown error');
		} finally {
			// Always redirect to login, even if logout fails
			if (browser) {
				window.location.href = '/login';
			}
		}
	}

	// Keyboard handlers
	function handleKeyPress(event: KeyboardEvent, callback: () => void | Promise<void>): void {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			event.stopPropagation();
			callback();
		}
	}
</script>

<div class="flex h-full w-full flex-col justify-between bg-transparent">
	<!-- Corporate Identity -->
	{#if isSidebarFull}
		<a href="/" aria-label="SveltyCMS Logo" class="flex pt-2 no-underline!" data-sveltekit-preload-data="hover">
			<SveltyCMSLogo fill="red" className="h-9 -ml-2" />
			<span class="base-font-color relative text-2xl font-bold">
				<SiteName highlight="CMS" />
			</span>
		</a>
	{:else}
		<div class="flex justify-start gap-2">
			<button
				type="button"
				onclick={() => toggleUIElement('leftSidebar', 'hidden')}
				aria-label="Close Sidebar"
				class="preset-outline-surface-500 btn-icon mt-1"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>

			<a href="/" aria-label="SveltyCMS Logo" class="flex justify-center pt-2 no-underline!">
				<SveltyCMSLogo fill="red" className="h-9 -ml-2 ltr:mr-2 rtl:ml-2 rtl:-mr-2" />
			</a>
		</div>
	{/if}

	<!-- Expand/Collapse Button -->
	<SystemTooltip title={isSidebarFull ? 'Collapse Sidebar' : 'Expand Sidebar'} positioning={{ placement: 'right' }}>
		<button
			type="button"
			onclick={toggleSidebar}
			aria-label={isSidebarFull ? 'Collapse Sidebar' : 'Expand Sidebar'}
			aria-expanded={isSidebarFull}
			class="absolute top-2 z-20 flex h-10 w-10 items-center justify-center rounded-full! border border-black p-0 dark:border-black ltr:-right-4 rtl:-left-4"
		>
			<iconify-icon
				icon="bi:arrow-left-circle-fill"
				width="34"
				class="rounded-full bg-surface-500 text-white transition-transform hover:cursor-pointer hover:bg-error-600 dark:bg-white dark:text-surface-600 dark:hover:bg-error-600 {isSidebarFull
					? 'rotate-0 rtl:rotate-180'
					: 'rotate-180 rtl:rotate-0'}"
			></iconify-icon>
		</button>
	</SystemTooltip>

	<!-- Navigation: Collections, Media Folders, or Settings -->
	{#if isSettingsMode}
		<SettingsMenu isFullSidebar={isSidebarFull} />

		<!-- Toggle to Collections Button -->
		<button
			class="btn mt-2 flex w-full items-center justify-center gap-2 rounded-sm border border-surface-500 py-4 transition-all duration-200 hover:bg-surface-200 dark:bg-surface-500 hover:dark:bg-surface-400"
			onclick={() => {
				setMode('view');
				navigateTo(firstCollectionPath);
			}}
			aria-label="Switch to Collections"
		>
			<iconify-icon icon="bi:arrow-left" width="18" class="text-error-500"></iconify-icon>
			{#if isSidebarFull}
				<iconify-icon icon="bi:collection" width="20" class="text-error-500"></iconify-icon>
				<span class="">{m.button_Collections()} </span>
			{:else}
				<iconify-icon icon="bi:collection" width="18" class="text-error-500"></iconify-icon>
			{/if}
		</button>
	{:else if isMediaMode}
		<MediaFolders />

		<!-- Toggle to Collections Button -->
		<button
			class="btn mt-2 flex w-full items-center justify-center gap-2 rounded-sm border border-surface-500 py-4 transition-all duration-200 hover:bg-surface-200 dark:bg-surface-500 hover:dark:bg-surface-400"
			onclick={() => {
				setMode('view');
				navigateTo(firstCollectionPath);
			}}
			aria-label="Switch to Collections"
		>
			<iconify-icon icon="bi:arrow-left" width="18" class="text-error-500"></iconify-icon>
			{#if isSidebarFull}
				<iconify-icon icon="bi:collection" width="20" class="text-error-500"></iconify-icon>
				<span class="">{m.button_Collections()} </span>
			{:else}
				<iconify-icon icon="bi:collection" width="18" class="text-error-500"></iconify-icon>
			{/if}
		</button>
	{:else}
		<Collections />

		<!-- Toggle to Media Gallery Button -->
		<button
			class="btn preset-outlined-surface-500 dark:preset-filled-surface-500 mt-2 flex h-14 w-full items-center justify-center gap-2 rounded"
			onclick={() => {
				setMode('media');
				navigateTo('/mediagallery');
			}}
			aria-label="Switch to Media Gallery"
		>
			{#if isSidebarFull}
				<iconify-icon icon="bi:images" width="20" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				<span class="">{m.Collections_MediaGallery()}</span>
				<iconify-icon icon="bi:arrow-right" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
			{:else}
				<iconify-icon icon="bi:images" width="18" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				<span class="text-sm">{m.collections_media()}</span>
			{/if}
		</button>
	{/if}

	<!-- Plugin Sidebar Items -->
	<div class="mt-2 w-full px-1">
		<Slot name="sidebar" />
	</div>

	<!-- Footer -->
	<div class="mb-2 mt-auto w-full px-1">
		<div class="mx-1 mb-2 border-0 border-t border-surface-500"></div>

		<div class="grid w-full items-center justify-center gap-2 {isSidebarFull ? 'grid-cols-3' : 'grid-cols-2'}">
			<!-- Avatar -->
			<div class="{isSidebarFull ? 'order-1 row-span-2' : 'order-1'} flex items-center justify-center">
				<SystemTooltip title={m.applayout_userprofile()} positioning={{ placement: 'right' }}>
					<button
						onclick={handleUserClick}
						onkeypress={(e) => handleKeyPress(e, handleUserClick)}
						aria-label="User Profile"
						class="{isSidebarFull
							? 'flex w-full flex-col items-center justify-center rounded-lg p-2 hover:bg-surface-500/20'
							: 'flex h-10 w-10 flex-col items-center justify-center rounded-full hover:bg-surface-500/20'} relative text-center no-underline!"
					>
						<Avatar class="mx-auto overflow-hidden rounded-full {isSidebarFull ? 'size-10' : 'size-9'}">
							<Avatar.Image src={avatarUrl} alt="User Avatar" class="h-full w-full object-cover" />
							<Avatar.Fallback>AV</Avatar.Fallback>
						</Avatar>
						{#if isSidebarFull && user?.username}
							<div
								class="mt-1 w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-[11px] font-medium leading-tight"
								title={user.username}
							>
								{user.username}
							</div>
						{/if}
					</button>
				</SystemTooltip>
			</div>

			<!-- Theme Toggle -->
			<div class="{isSidebarFull ? 'order-2' : 'order-2'} flex items-center justify-center">
				<SystemTooltip title={themeTooltipText} positioning={{ placement: 'right' }}>
					<!-- Wrapper div needed because ThemeToggle might not forward all events/props or to serve as reliable trigger anchor -->
					<div class="flex items-center justify-center">
						<ThemeToggle showTooltip={false} buttonClass="btn-icon  rounded-full hover:bg-surface-300/20" iconSize={32} />
					</div>
				</SystemTooltip>
			</div>

			<!-- Language Selector -->
			<div class="{isSidebarFull ? 'order-3 row-span-2' : 'order-4'} flex items-center justify-center px-1">
				<SystemTooltip title={m.applayout_systemlanguage()} positioning={{ placement: 'right' }}>
					<div class="language-selector relative">
						<Menu positioning={{ placement: 'right-start', gutter: 10 }}>
							<Menu.Trigger
								class="preset-filled-surface-500 hover:bg-surface-400 rounded-full btn-icon flex items-center justify-center uppercase transition-colors {isSidebarFull
									? 'mb-3 w-6.5 h-6.5 text-xs'
									: 'w-6 h-6 text-xs'}"
								aria-label="Select language"
							>
								{languageTag}
							</Menu.Trigger>

							<Portal>
								<Menu.Positioner>
									<Menu.Content
										class="card p-2 shadow-xl preset-filled-surface-100-900 z-9999 w-56 border border-surface-200 dark:border-surface-500"
									>
										<!-- Header to inform user about System Language context -->
										<div
											class="px-3 py-2 text-xs font-bold text-tertiary-500 dark:text-primary-500 uppercase tracking-wider text-center border-b border-surface-200 dark:border-surface-50 mb-1"
										>
											{m.applayout_systemlanguage()}
										</div>

										{#if showLanguageDropdown}
											<div class="px-2 pb-2 mb-1 border-b border-surface-200 dark:border-surface-50">
												<input
													type="text"
													bind:value={searchQuery}
													placeholder="Search language..."
													class="w-full rounded-md bg-surface-200 dark:bg-surface-800 px-3 py-2 text-sm placeholder:text-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-surface-900 dark:text-white border-none"
													aria-label="Search languages"
													onclick={(e) => e.stopPropagation()}
												/>
											</div>

											<div class="max-h-64 divide-y divide-surface-200 dark:divide-surface-700 overflow-y-auto">
												{#each filteredLanguages as lang (lang)}
													<Menu.Item
														value={lang}
														onclick={() => handleLanguageSelection(lang)}
														class="flex w-full items-center justify-between px-3 py-2 text-left rounded-sm cursor-pointer"
													>
														<span class="text-sm font-medium text-surface-900 dark:text-surface-200">{getLanguageName(lang)}</span>
														<span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ml-2">{lang.toUpperCase()}</span>
													</Menu.Item>
												{/each}
											</div>
										{:else}
											{#each availableLanguages.filter((l) => l !== languageTag) as lang (lang)}
												<Menu.Item
													value={lang}
													onclick={() => handleLanguageSelection(lang)}
													class="flex w-full items-center justify-between px-3 py-2 text-left  rounded-sm cursor-pointer"
												>
													<span class="text-sm font-medium">{getLanguageName(lang)}</span>
													<span class="text-xs font-normal text-tertiary-500 dark:text-primary-500 ml-2">{lang.toUpperCase()}</span>
												</Menu.Item>
											{/each}
										{/if}
									</Menu.Content>
								</Menu.Positioner>
							</Portal>
						</Menu>
					</div>
				</SystemTooltip>
			</div>

			<!-- Sign Out -->
			<div class="{isSidebarFull ? 'order-4' : 'order-3'} flex items-center justify-center">
				<SystemTooltip title={m.applayout_signout()} positioning={{ placement: 'right' }}>
					<button onclick={signOut} type="button" aria-label="Sign Out" class="btn-icon hover:bg-surface-500/20">
						<iconify-icon icon="uil:signout" width="26" class=""></iconify-icon>
					</button>
				</SystemTooltip>
			</div>

			<!-- Config -->
			<div class="{isSidebarFull ? 'order-5' : 'order-6'} flex items-center justify-center">
				<SystemTooltip title={m.applayout_systemconfiguration()} positioning={{ placement: 'right' }}>
					<button
						onclick={handleConfigClick}
						onkeypress={(e) => handleKeyPress(e, handleConfigClick)}
						aria-label="System Configuration"
						class="btn-icon hover:bg-surface-500/20"
					>
						<iconify-icon icon="material-symbols:build-circle" width="38" class=""></iconify-icon>
					</button>
				</SystemTooltip>
			</div>

			<!-- Version -->
			<div class="{isSidebarFull ? 'order-6' : 'order-5'} flex items-center justify-center">
				<VersionCheck compact={!isSidebarFull} />
			</div>

			<!-- GitHub (only when expanded) -->
			{#if isSidebarFull}
				<div class="order-7 flex items-center justify-center {isSidebarFull ? '' : 'col-span-2'}">
					<SystemTooltip title={m.applayout_githubdiscussion()} positioning={{ placement: 'right' }}>
						<a
							href="https://github.com/SveltyCMS/SveltyCMS/discussions"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="GitHub Discussions"
							class="btn-icon flex items-center justify-center hover:bg-surface-500/20"
						>
							<iconify-icon icon="grommet-icons:github" width="30" class=""></iconify-icon>
						</a>
					</SystemTooltip>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Scrollbar styling */
	.overflow-y-auto {
		scrollbar-width: thin;
		scrollbar-color: rgb(var(--color-surface-500)) transparent;
	}

	.overflow-y-auto::-webkit-scrollbar {
		width: 6px;
	}

	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb {
		background-color: rgb(var(--color-surface-500));
		border-radius: 3px;
	}
</style>
