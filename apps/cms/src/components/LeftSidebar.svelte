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
	import { logger } from '@shared/utils/logger';

	// Import necessary utilities and types
	import { page } from '$app/state';
	import type { Schema } from '@cms/types/content'; // Import Schema type (collection definition)
	import type { Role } from '@shared/database/auth/types';
	import { getLanguageName } from '@shared/utils/languageUtils';
	import { locales as availableLocales } from '$lib/paraglide/runtime.js';

	// Stores
	import { setMode } from '@cms/stores/collectionStore.svelte';
	import { avatarSrc, systemLanguage } from '@shared/stores/store.svelte';
	import { toggleUIElement, uiStateManager, userPreferredState } from '@cms/stores/UIStore.svelte';
	import { globalLoadingStore, loadingOperations } from '@cms/stores/loadingStore.svelte';
	import { themeStore } from '@shared/stores/themeStore.svelte';

	// Import components
	import VersionCheck from '@shared/components/VersionCheck.svelte';
	import Collections from '@cms/components/Collections.svelte';
	import MediaFolders from '@cms/components/MediaFolders.svelte';
	import SettingsMenu from '@shared/components/SettingsMenu.svelte';
	import SiteName from '@shared/components/SiteName.svelte';
	import SveltyCMSLogo from '@cms/components/system/icons/SveltyCMS_Logo.svelte';
	import ThemeToggle from '@shared/components/ThemeToggle.svelte';

	// Skeleton components
	import { Avatar, Portal, Tooltip, Menu } from '@skeletonlabs/skeleton-svelte';

	// Language and messaging
	import * as m from '$paraglide/messages.js';
	import { getLocale } from '$lib/paraglide/runtime.js';

	// Constants
	const MOBILE_BREAKPOINT = 768;
	const LANGUAGE_DROPDOWN_THRESHOLD = 5;
	const AVATAR_CACHE_BUSTER = Date.now();
	const TOOLTIP_CLASS =
		'card w-48 rounded-md border border-slate-300/50 bg-surface-50 p-2 text-xs shadow-xl dark:border-slate-600 dark:bg-surface-700 text-black dark:text-white';
	const ARROW_CLASS = '[--arrow-size:--spacing(2)] [--arrow-background:var(--color-surface-100-900)]';

	// Types
	type AvailableLanguage = string;
	type SidebarState = 'full' | 'collapsed' | 'hidden';

	// Reactive user data
	const user = $derived(page.data.user);
	const currentPath = $derived(page.url.pathname);
	const collections: Schema[] = $derived(page.data.collections);
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

	const firstCollectionPath = $derived(collections?.[0] ? `/Collections/${collections[0].name}` : '/Collections');

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
		if (!src) return '/Default_User.svg';

		// Don't process the default avatar - it's a static asset
		if (src === '/Default_User.svg' || src === 'Default_User.svg') {
			return '/Default_User.svg';
		}

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
		systemLanguage.set(lang as any);
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

	function iconForRole(role: Role | string): string {
		const roleName = typeof role === 'string' ? role : role.name;
		switch (roleName) {
			case 'admin':
				return 'eos-icons:admin-outlined';
			case 'editor':
				return 'user-expert';
			default:
				return 'carbon:user-avatar-filled-alt';
		}
	}
</script>

<div class="flex h-full w-full flex-col justify-between bg-transparent py-4">
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

	<!-- Footer -->
	<div class="mb-2 mt-auto w-full px-1">
		<div class="mx-1 mb-2 border-0 border-t border-surface-500"></div>

		<div class="grid w-full items-center justify-center gap-2 {isSidebarFull ? 'grid-cols-3' : 'grid-cols-2'}">
			<!-- Avatar -->
			<div class="{isSidebarFull ? 'order-1 row-span-2' : 'order-1'} flex items-center justify-center">
				<Tooltip positioning={{ placement: 'right' }}>
					<Tooltip.Trigger>
						<button
							onclick={handleUserClick}
							onkeypress={(e) => handleKeyPress(e, handleUserClick)}
							aria-label="User Profile"
							class="{isSidebarFull
								? 'flex w-full flex-col items-center justify-center rounded-lg p-2 hover:bg-surface-500/20'
								: 'btn-icon rounded-full! w-10 h-10 flex items-center justify-center p-0'} relative text-center no-underline!"
						>
							<div class="relative inline-block">
								<Avatar class="mx-auto overflow-hidden rounded-full {isSidebarFull ? 'size-10' : 'size-9'}">
									<Avatar.Image src={avatarUrl} alt="User Avatar" class="h-full w-full object-cover" />
									<Avatar.Fallback>AV</Avatar.Fallback>
								</Avatar>
								<div class="absolute -right-2 -top-2 z-10 badge-icon preset-filled-primary-500" title={user.role}>
									<iconify-icon icon={iconForRole(user.role)} width="16"></iconify-icon>
								</div>
							</div>
							{#if isSidebarFull && user?.username}
								<div
									class="mt-1 w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-[11px] font-medium leading-tight"
									title={user.username}
								>
									{user.username}
								</div>
							{/if}
						</button>
					</Tooltip.Trigger>
					<Portal>
						<Tooltip.Positioner>
							<Tooltip.Content class={TOOLTIP_CLASS}>
								<span>{m.applayout_userprofile()}</span>
								<Tooltip.Arrow class={ARROW_CLASS}>
									<Tooltip.ArrowTip />
								</Tooltip.Arrow>
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>

			<!-- Theme Toggle -->
			<div class="{isSidebarFull ? 'order-2' : 'order-2'} flex items-center justify-center">
				<Tooltip positioning={{ placement: 'right' }}>
					<Tooltip.Trigger>
						<!-- Wrapper div needed because ThemeToggle might not forward all events/props or to serve as reliable trigger anchor -->
						<div class="flex items-center justify-center">
							<ThemeToggle showTooltip={false} buttonClass="btn-icon hover:bg-surface-500/20" iconSize={22} />
						</div>
					</Tooltip.Trigger>
					<Portal>
						<Tooltip.Positioner>
							<Tooltip.Content class={TOOLTIP_CLASS}>
								<span>{themeTooltipText}</span>
								<Tooltip.Arrow class={ARROW_CLASS}>
									<Tooltip.ArrowTip />
								</Tooltip.Arrow>
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>

			<!-- Language Selector -->
			<div class="{isSidebarFull ? 'order-3 row-span-2' : 'order-4'} flex items-center justify-center px-1">
				<Tooltip positioning={{ placement: 'right' }}>
					<Tooltip.Trigger>
						<div class="language-selector relative">
							<Menu positioning={{ placement: 'right-start', gutter: 10 }}>
								<Menu.Trigger
									class="preset-filled-surface-500 hover:bg-surface-400 rounded-full btn-icon flex items-center justify-center uppercase transition-colors {isSidebarFull
										? 'mb-3 w-8 h-8 text-sm'
										: 'w-8 h-8 text-xs'}"
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
					</Tooltip.Trigger>
					<Portal>
						<Tooltip.Positioner>
							<Tooltip.Content class={TOOLTIP_CLASS}>
								<span>{m.applayout_systemlanguage()}</span>
								<Tooltip.Arrow class={ARROW_CLASS}>
									<Tooltip.ArrowTip />
								</Tooltip.Arrow>
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>

			<!-- Sign Out -->
			<div class="{isSidebarFull ? 'order-4' : 'order-3'} flex items-center justify-center">
				<Tooltip positioning={{ placement: 'right' }}>
					<Tooltip.Trigger>
						<button onclick={signOut} type="button" aria-label="Sign Out" class="btn-icon hover:bg-surface-500/20">
							<iconify-icon icon="uil:signout" width="26" class=""></iconify-icon>
						</button>
					</Tooltip.Trigger>
					<Portal>
						<Tooltip.Positioner>
							<Tooltip.Content class={TOOLTIP_CLASS}>
								<span>{m.applayout_signout()}</span>
								<Tooltip.Arrow class={ARROW_CLASS}>
									<Tooltip.ArrowTip />
								</Tooltip.Arrow>
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>

			<!-- Config -->
			<div class="{isSidebarFull ? 'order-5' : 'order-6'} flex items-center justify-center">
				<Tooltip positioning={{ placement: 'right' }}>
					<Tooltip.Trigger>
						<button
							onclick={handleConfigClick}
							onkeypress={(e) => handleKeyPress(e, handleConfigClick)}
							aria-label="System Configuration"
							class="btn-icon hover:bg-surface-500/20"
						>
							<iconify-icon icon="material-symbols:build-circle" width="34" class=""></iconify-icon>
						</button>
					</Tooltip.Trigger>

					<Portal>
						<Tooltip.Positioner>
							<Tooltip.Content class={TOOLTIP_CLASS}>
								<span>{m.applayout_systemconfiguration()}</span>
								<Tooltip.Arrow class={ARROW_CLASS}>
									<Tooltip.ArrowTip />
								</Tooltip.Arrow>
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>

			<!-- Version -->
			<div class="{isSidebarFull ? 'order-6' : 'order-5'} flex items-center justify-center">
				<VersionCheck compact={!isSidebarFull} />
			</div>

			<!-- GitHub (only when expanded) -->
			{#if isSidebarFull}
				<div class="order-7 flex items-center justify-center {isSidebarFull ? '' : 'col-span-2'}">
					<Tooltip positioning={{ placement: 'right' }}>
						<Tooltip.Trigger>
							<a
								href="https://github.com/SveltyCMS/SveltyCMS/discussions"
								target="_blank"
								rel="noopener noreferrer"
								aria-label="GitHub Discussions"
								class="btn-icon flex items-center justify-center hover:bg-surface-500/20"
							>
								<iconify-icon icon="grommet-icons:github" width="30" class=""></iconify-icon>
							</a>
						</Tooltip.Trigger>
						<Portal>
							<Tooltip.Positioner>
								<Tooltip.Content class={TOOLTIP_CLASS}>
									<span>{m.applayout_githubdiscussion()}</span>
									<Tooltip.Arrow class={ARROW_CLASS}>
										<Tooltip.ArrowTip />
									</Tooltip.Arrow>
								</Tooltip.Content>
							</Tooltip.Positioner>
						</Portal>
					</Tooltip>
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
