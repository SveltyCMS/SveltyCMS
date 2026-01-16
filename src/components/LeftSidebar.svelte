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
	import type { Schema } from '@src/content/types'; // Import Schema type (collection definition)
	import { getLanguageName } from '@utils/languageUtils';
	import { locales as availableLocales } from '@src/paraglide/runtime';

	// Stores
	import { setMode } from '@stores/collectionStore.svelte';
	import { avatarSrc, systemLanguage } from '@stores/store.svelte';
	import { toggleUIElement, uiStateManager, userPreferredState } from '@stores/UIStore.svelte';
	import { globalLoadingStore, loadingOperations } from '@stores/loadingStore.svelte';

	// Import components
	import VersionCheck from '@components/VersionCheck.svelte';
	import Collections from '@components/Collections.svelte';
	import MediaFolders from '@components/MediaFolders.svelte';
	import SiteName from '@components/SiteName.svelte';
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import ThemeToggle from '@components/ThemeToggle.svelte';

	// Skeleton components
	import { Avatar, Portal, Tooltip } from '@skeletonlabs/skeleton-svelte';

	// Language and messaging
	import * as m from '@src/paraglide/messages';
	import { getLocale } from '@src/paraglide/runtime';

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
	const collections: Schema[] = $derived(page.data.collections);
	// Check if we're in media mode
	const isMediaMode = $derived(currentPath.includes('/mediagallery'));

	// Language state
	let languageTag = $state(getLocale() as AvailableLanguage);
	let searchQuery = $state('');
	let isDropdownOpen = $state(false);
	let dropdownRef = $state<HTMLElement | null>(null);

	// Derived values
	const isSidebarFull = $derived(uiStateManager.uiState.value.leftSidebar === 'full');
	const isSidebarCollapsed = $derived(uiStateManager.uiState.value.leftSidebar === 'collapsed');

	const firstCollectionPath = $derived(collections?.[0] ? `/Collections/${collections[0].name}` : '/Collections');

	const availableLanguages = $derived([...availableLocales].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en'))));

	const showLanguageDropdown = $derived(availableLanguages.length > LANGUAGE_DROPDOWN_THRESHOLD);

	const filteredLanguages = $derived(
		availableLanguages.filter((lang: string) => {
			const searchLower = searchQuery.toLowerCase();
			const systemLangName = getLanguageName(lang, systemLanguage.value).toLowerCase();
			const enLangName = getLanguageName(lang, 'en').toLowerCase();
			return systemLangName.includes(searchLower) || enLangName.includes(searchLower);
		}) as AvailableLanguage[]
	);

	const avatarUrl = $derived.by(() => {
		const src = avatarSrc.value;
		if (!src) return '/Default_User.svg';
		if (src.startsWith('data:')) return src;
		return `${src}?t=${AVATAR_CACHE_BUSTER}`;
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
			// Special handling: mediagallery doesn't use language prefix
			if (path === '/mediagallery' || path.startsWith('/mediagallery')) {
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

	// Click outside handler
	$effect(() => {
		if (!browser) return;

		const handleClick = (event: MouseEvent) => {
			if (dropdownRef && !dropdownRef.contains(event.target as Node)) {
				isDropdownOpen = false;
				searchQuery = '';
			}
		};

		document.addEventListener('click', handleClick);
		return () => document.removeEventListener('click', handleClick);
	});

	// Event handlers
	function handleLanguageSelection(lang: AvailableLanguage): void {
		systemLanguage.set(lang as any);
		languageTag = lang;
		isDropdownOpen = false;
		searchQuery = '';
	}

	function handleLanguageSelectChange(event: Event): void {
		const target = event.target as HTMLSelectElement;
		if (target?.value) {
			handleLanguageSelection(target.value as AvailableLanguage);
		}
	}

	function toggleLanguageDropdown(event: Event): void {
		event.stopPropagation();
		isDropdownOpen = !isDropdownOpen;
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

<div class="flex h-full w-full flex-col justify-between bg-white dark:bg-surface-900 border-r border-surface-200 dark:border-surface-700">
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
				class="preset-ghost-surface-500 btn-icon mt-1"
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

	<!-- Navigation: Collections or Media Folders -->
	{#if isMediaMode}
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
			class="btn mt-2 flex w-full items-center justify-center gap-2 rounded-sm border border-surface-500 py-4 transition-all duration-200 hover:bg-surface-200 dark:bg-surface-500 hover:dark:bg-surface-400"
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
	<div class="mb-2 mt-auto">
		<div class="mx-1 mb-1 border-0 border-t border-surface-500"></div>

		<div class="grid items-center justify-center gap-1 {isSidebarFull ? 'grid-cols-3' : 'grid-cols-2'}">
			<!-- Avatar -->
			<div class="{isSidebarFull ? 'order-1 row-span-2' : 'order-1'} flex justify-center">
				<Tooltip positioning={{ placement: 'right' }}>
					<Tooltip.Trigger>
						<button
							onclick={handleUserClick}
							onkeypress={(e) => handleKeyPress(e, handleUserClick)}
							aria-label="User Profile"
							class="{isSidebarFull
								? 'flex w-full flex-col items-center justify-center rounded-lg p-2 hover:bg-surface-500 hover:text-white'
								: 'btn-icon flex-col items-center justify-center'} relative text-center no-underline! md:row-span-2"
						>
							<Avatar class="mx-auto {isSidebarFull ? 'w-[40px]' : 'w-[35px]'}">
								<Avatar.Image src={avatarUrl} alt="User Avatar" />
								<Avatar.Fallback>AV</Avatar.Fallback>
							</Avatar>
							{#if isSidebarFull && user?.username}
								<div
									class="mt-1 w-full overflow-hidden text-ellipsis whitespace-nowrap text-center text-[11px] font-medium leading-tight text-black dark:text-white"
									title={user.username}
								>
									{user.username}
								</div>
							{/if}
						</button>
					</Tooltip.Trigger>
					<Portal>
						<Tooltip.Positioner>
							<Tooltip.Content class="card preset-filled-surface-900 z-50 rounded-md p-2 text-sm text-white shadow-xl">
								{m.applayout_userprofile()}
								<Tooltip.Arrow class="[--arrow-size:--spacing(2)]">
									<Tooltip.ArrowTip />
								</Tooltip.Arrow>
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>

			<!-- Language Selector -->
			<div class={isSidebarFull ? 'order-3 row-span-2 mx-auto pb-4' : 'order-2 mx-auto'}>
				<Tooltip positioning={{ placement: 'right' }}>
					<Tooltip.Trigger>
						<div class="language-selector relative" bind:this={dropdownRef}>
							{#if showLanguageDropdown}
								<button
									class="preset-filled-surface-500 btn-icon flex items-center justify-between uppercase text-white {isSidebarFull
										? 'px-2.5 py-2'
										: 'px-1.5 py-0'}"
									onclick={toggleLanguageDropdown}
									aria-label="Select language"
									data-testid="language-selector"
									aria-expanded={isDropdownOpen}
								>
									<span>{languageTag}</span>
									<svg
										class="h-4 w-4 transition-transform {isDropdownOpen ? 'rotate-180' : ''}"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
										aria-hidden="true"
									>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
									</svg>
								</button>

								{#if isDropdownOpen}
									<div class="absolute -top-40 left-20 z-50 mt-1 w-48 rounded-lg border bg-surface-700 shadow-lg">
										<div class="border-b border-surface-600 p-2">
											<input
												type="text"
												bind:value={searchQuery}
												placeholder="Search language..."
												class="w-full rounded-md bg-surface-800 px-3 py-2 text-white placeholder:text-surface-400 focus:outline-none focus:ring-2"
												aria-label="Search languages"
											/>
										</div>

										<div class="max-h-48 divide-y divide-preset-600 overflow-y-auto py-1">
											{#each filteredLanguages as lang (lang)}
												<button
													class="flex w-full items-center justify-between px-4 py-2 text-left text-white hover:bg-surface-600 {languageTag === lang
														? 'bg-surface-600'
														: ''}"
													onclick={() => handleLanguageSelection(lang)}
												>
													<span>{getLanguageName(lang)} ({lang.toUpperCase()})</span>
												</button>
											{/each}
										</div>
									</div>
								{/if}
							{:else}
								<select
									bind:value={languageTag}
									onchange={handleLanguageSelectChange}
									aria-label="Select language"
									class="preset-filled-surface-500 appearance-none! rounded-full uppercase text-white {isSidebarFull
										? 'btn-icon px-2.5 py-2'
										: 'btn-icon-sm px-1.5 py-0'}"
								>
									{#each availableLanguages as lang (lang)}
										<option value={lang}>{lang.toUpperCase()}</option>
									{/each}
								</select>
							{/if}
						</div>
					</Tooltip.Trigger>
					<Portal>
						<Tooltip.Positioner>
							<Tooltip.Content class="card preset-filled-surface-900 z-50 rounded-md p-2 text-sm text-white shadow-xl">
								{m.applayout_systemlanguage()}
								<Tooltip.Arrow class="[--arrow-size:--spacing(2)]">
									<Tooltip.ArrowTip />
								</Tooltip.Arrow>
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>

			<!-- Theme Toggle -->
			<div class={isSidebarFull ? 'order-2' : 'order-3'}>
				<ThemeToggle showTooltip={true} tooltipPlacement="right" buttonClass="btn-icon hover:bg-surface-500 hover:text-white" iconSize={22} />
			</div>

			<!-- Sign Out -->
			<div class="order-4">
				<Tooltip positioning={{ placement: 'right' }}>
					<Tooltip.Trigger>
						<button onclick={signOut} type="button" aria-label="Sign Out" class="btn-icon hover:bg-surface-500 hover:text-white">
							<iconify-icon icon="uil:signout" width="26"></iconify-icon>
						</button>
					</Tooltip.Trigger>
					<Portal>
						<Tooltip.Positioner>
							<Tooltip.Content class="card preset-filled-surface-900 z-50 rounded-md p-2 text-sm text-white shadow-xl">
								{m.applayout_signout()}
								<Tooltip.Arrow class="[--arrow-size:--spacing(2)]">
									<Tooltip.ArrowTip />
								</Tooltip.Arrow>
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>

			<!-- Config -->
			<div class={isSidebarFull ? 'order-5' : 'order-6'}>
				<Tooltip positioning={{ placement: 'right' }}>
					<Tooltip.Trigger>
						<button
							onclick={handleConfigClick}
							onkeypress={(e) => handleKeyPress(e, handleConfigClick)}
							aria-label="System Configuration"
							class="btn-icon hover:bg-surface-500 hover:text-white"
						>
							<iconify-icon icon="material-symbols:build-circle" width="34"></iconify-icon>
						</button>
					</Tooltip.Trigger>
					<Portal>
						<Tooltip.Positioner>
							<Tooltip.Content class="card preset-filled-surface-900 z-50 rounded-md p-2 text-sm text-white shadow-xl">
								{m.applayout_systemconfiguration()}
								<Tooltip.Arrow class="[--arrow-size:--spacing(2)]">
									<Tooltip.ArrowTip />
								</Tooltip.Arrow>
							</Tooltip.Content>
						</Tooltip.Positioner>
					</Portal>
				</Tooltip>
			</div>

			<!-- Version -->
			<div class={isSidebarFull ? 'order-6' : 'order-5'}>
				<VersionCheck compact={isSidebarCollapsed} />
			</div>

			<!-- GitHub (only when expanded) -->
			{#if isSidebarFull}
				<div class="order-7">
					<a
						href="https://github.com/SveltyCMS/SveltyCMS/discussions"
						target="_blank"
						rel="noopener noreferrer"
						title={m.applayout_githubdiscussion()}
						aria-label="GitHub Discussions"
						class="btn-icon flex items-center justify-center hover:bg-surface-500 hover:text-white"
					>
						<iconify-icon icon="grommet-icons:github" width="30"></iconify-icon>
					</a>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	/* Scrollbar styling */
	.overflow-y-auto {
		scrollbar-width: thin;
		scrollbar-color: rgb(var(--color-preset-500)) transparent;
	}

	.overflow-y-auto::-webkit-scrollbar {
		width: 6px;
	}

	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
	}

	.overflow-y-auto::-webkit-scrollbar-thumb {
		background-color: rgb(var(--color-preset-500));
		border-radius: 3px;
	}
</style>
