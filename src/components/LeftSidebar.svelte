<!-- 
@file src/components/LeftSidebar.svelte 

@component
**LeftSidebar component displaying collection fields, publish options and translation status.**

@example
<LeftSidebar />

#### Props
- `collection` {object} - Collection object
- `mode` {object} - The current mode object from the mode store

#### Features
- Displays collection fields
- Displays publish options
- Displays translation status
-->

<script module lang="ts">
	declare const __VERSION__: string;
</script>

<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { goto, invalidateAll } from '$app/navigation';
	import axios from 'axios';
	import { page } from '$app/state';

	// Stores
	import { get } from 'svelte/store';
	import { avatarSrc, pkgBgColor, systemLanguage } from '@stores/store.svelte';
	import { mode } from '@stores/collectionStore.svelte';
	import { toggleSidebar, sidebarState, userPreferredState, handleSidebarToggle } from '@src/stores/sidebarStore.svelte';
	import { screenSize } from '@stores/screenSizeStore.svelte';
	import { themeName, updateTheme } from '@root/src/stores/themeStore.svelte'; // Import reactive store

	// Components
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import SiteName from '@components/SiteName.svelte';
	import Collections from '@components/Collections.svelte';
	import { getLanguageName } from '@utils/languageUtils';

	// Skeleton components and utilities
	import { Avatar, Tooltip } from '@skeletonlabs/skeleton-svelte';
	// State
	let openState = $state(false);
	const user = page.data.user;
	avatarSrc.set(user?.avatar);

	// Language and messaging setup
	import * as m from '@src/paraglide/messages';
	import { languageTag } from '@src/paraglide/runtime';

	// Define language type based on available languages
	type AvailableLanguage = (typeof publicEnv.AVAILABLE_SYSTEM_LANGUAGES)[number];
	let _languageTag = $state(languageTag()); // Get the current language tag

	// Enhanced language selector
	let searchQuery = $state('');
	let isDropdownOpen = $state(false);
	let dropdownRef = $state<HTMLElement | null>(null);

	// Computed values
	const availableLanguages = $derived(
		[...publicEnv.AVAILABLE_SYSTEM_LANGUAGES].sort((a, b) => getLanguageName(a, 'en').localeCompare(getLanguageName(b, 'en')))
	);

	const filteredLanguages = $derived(
		availableLanguages.filter(
			(lang: string) =>
				getLanguageName(lang, systemLanguage.value).toLowerCase().includes(searchQuery.toLowerCase()) ||
				getLanguageName(lang, 'en').toLowerCase().includes(searchQuery.toLowerCase())
		) as AvailableLanguage[]
	);

	// Click outside effect
	$effect(() => {
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
	function handleLanguageSelection(lang: AvailableLanguage) {
		systemLanguage.set(lang);
		_languageTag = lang;
		isDropdownOpen = false;
		searchQuery = '';
	}

	// SignOut function
	async function signOut() {
		try {
			console.log('Starting sign-out process...');

			// Call the logout API endpoint
			const response = await axios.post('/api/user/logout', {}, { withCredentials: true });
			console.log('Logout response:', response.data);

			// Always invalidate and redirect, even if the server response isn't as expected
			await invalidateAll();
			console.log('All data invalidated');
			await goto('/login');
			console.log('Redirected to login page');
		} catch (error) {
			console.error('Error during sign-out:', error instanceof Error ? error.message : 'Unknown error');

			// Even if there's an error, we should still invalidate and redirect
			await invalidateAll();
			await goto('/login');
		}
	}

	// GitHub version and theme toggle
	const pkg = __VERSION__ || '';
	let githubVersion = '';

	axios
		.get('https://api.github.com/repos/Rar9/SveltyCMS/releases/latest')
		.then((response) => {
			githubVersion = response.data.tag_name.slice(1);
			const [localMajor, localMinor] = pkg.split('.').map(Number);
			const [githubMajor, githubMinor] = githubVersion.split('.').map(Number);

			if (githubMinor > localMinor) {
				$pkgBgColor = 'preset-filled-warning-500';
			} else if (githubMajor !== localMajor) {
				$pkgBgColor = 'preset-filled-error-500';
			}
		})
		.catch((error) => {
			console.error('Error von Github Release found:', error);
			githubVersion = pkg;
			$pkgBgColor = 'preset-filled-tertiary-500';
		});

	const toggleTheme = async () => {
		const currentTheme = themeName(); // Get current value
		const newThemeName = currentTheme === 'dark' ? 'light' : 'dark';

		// Update theme in store
		await updateTheme(newThemeName);

		// Update document class for Tailwind v4
		if (typeof window !== 'undefined') {
			document.documentElement.dataset.theme = newThemeName;
			localStorage.setItem('theme', newThemeName);
		}
	};

	function handleSelectChange(event: Event) {
		const target = event.target as HTMLSelectElement;
		if (target) {
			handleLanguageSelection(target.value as AvailableLanguage);
		}
	}
</script>

<div class="flex h-full w-full flex-col justify-between">
	<!-- Corporate Identity Full -->
	{#if sidebarState.sidebar.value.left === 'full'}
		<a href="/" aria-label="SveltyCMS Logo" class="flex pt-2 no-underline!">
			<SveltyCMSLogo fill="red" className="h-9 -ml-2" />
			<span class="base-font-color relative text-2xl font-bold"><SiteName /> </span>
		</a>
	{:else}
		<!-- Corporate Identity Collapsed-->
		<div class="gap flex justify-start">
			<button
				type="button"
				onclick={() => toggleSidebar('left', 'hidden')}
				aria-label="Open Sidebar"
				class="preset-tonal-surface border-surface-500 btn-icon mt-1 border"
			>
				<iconify-icon icon="mingcute:menu-fill" width="24"></iconify-icon>
			</button>

			<a href="/" aria-label="SveltyCMS Logo" class="flex justify-center pt-2 no-underline!">
				<SveltyCMSLogo fill="red" className="h-9 -ml-2 ltr:mr-2 rtl:ml-2 rtl:-mr-2" />
			</a>
		</div>
	{/if}

	<!-- Button to expand/collapse sidebar -->
	<button
		type="button"
		onclick={() => {
			toggleSidebar('left', sidebarState.sidebar.value.left === 'full' ? 'collapsed' : 'full');
			userPreferredState.set(sidebarState.sidebar.value.left === 'full' ? 'collapsed' : 'full');
		}}
		aria-label="Expand/Collapse Sidebar"
		class="absolute top-2 z-20 flex items-center justify-center rounded-full! border-[3px] ltr:-right-3 rtl:-left-3 dark:border-black"
	>
		<iconify-icon
			icon="bi:arrow-left-circle-fill"
			width="30"
			class={`bg-surface-500 hover:bg-error-600 dark:text-surface-600 dark:hover:bg-error-600 rounded-full text-white hover:cursor-pointer dark:bg-white ${sidebarState.sidebar.value.left === 'full' ? 'rotate-0 rtl:rotate-180' : 'rotate-180 rtl:rotate-0'}`}
		></iconify-icon>
	</button>

	<!--SideBar Middle -->
	<Collections />

	<!-- Sidebar Left Footer -->
	<div class="dark:from-surface-700 dark:to-surface-900 mt-auto mb-2 bg-white dark:bg-linear-to-r">
		<div class="border-surface-400 mx-1 mb-1 border-0 border-t"></div>

		<div
			class="{sidebarState.sidebar.value.left === 'full' ? 'grid-cols-3 grid-rows-3' : 'grid-cols-2 grid-rows-2'} grid items-center justify-center"
		>
			<!-- Avatar with user settings -->
			<div class={sidebarState.sidebar.value.left === 'full' ? 'order-1 row-span-2' : 'order-1'}>
				<Tooltip
					open={openState}
					onOpenChange={(e) => (openState = e.open)}
					positioning={{ placement: 'right' }}
					triggerBase="underline"
					contentBase="btn-icon relative cursor-pointer flex-col items-center justify-center text-center no-underline! md:row-span-2"
					openDelay={200}
					arrow
				>
					{#snippet trigger()}
						<Avatar
							name="User"
							src={$avatarSrc ? `${$avatarSrc}?t=${Date.now()}` : '/Default_User.svg'}
							size={sidebarState.sidebar.value.left === 'full' ? 'w-[40px]' : 'w-[35px]'}
							classes="mx-auto"
						/>
						<div class="text-center text-[10px] text-black uppercase dark:text-white">
							{#if sidebarState.sidebar.value.left === 'full'}
								{#if user?.username}
									<div class="-ml-0.5">
										{user?.username}
									</div>
								{/if}
							{/if}
						</div>
					{/snippet}

					{#snippet content()}
						<div class="card preset-filled z-50 max-w-sm p-2">
							{m.applayout_userprofile()}
							<div class="arrow preset-filled"></div>
						</div>
					{/snippet}
				</Tooltip>
			</div>

			<!-- Enhanced System Language Selector -->
			<div class={sidebarState.sidebar.value.left === 'full' ? 'order-3 row-span-2 mx-auto pb-4' : 'order-2 mx-auto'}>
				<Tooltip positioning={{ placement: 'right' }} openDelay={200}>
					{#snippet trigger()}
						<div class="language-selector relative" bind:this={dropdownRef}>
							{#if publicEnv.AVAILABLE_SYSTEM_LANGUAGES.length > 5}
								<button
									class="preset-filled-surface-500 btn-icon flex items-center justify-between text-white uppercase {sidebarState.sidebar.value
										.left === 'full'
										? 'px-2.5 py-2'
										: 'px-1.5 py-0'}"
									onclick={(e) => {
										e.stopPropagation();
										isDropdownOpen = !isDropdownOpen;
									}}
								>
									<span>{_languageTag}</span>
									<svg
										class="h-4 w-4 transition-transform {isDropdownOpen ? 'rotate-180' : ''}"
										fill="none"
										stroke="currentColor"
										viewBox="0 0 24 24"
									>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
									</svg>
								</button>

								{#if isDropdownOpen}
									<div class="bg-surface-700 absolute -top-40 left-20 z-50 mt-1 w-48 rounded-lg border shadow-lg">
										<div class="border-surface-600 border-b p-2">
											<input
												type="text"
												bind:value={searchQuery}
												placeholder="Search language..."
												class="bg-surface-800 placeholder:text-surface-400 w-full rounded-md px-3 py-2 text-white focus:ring-2 focus:outline-hidden"
											/>
										</div>

										<div class="divide-surface-600 max-h-48 divide-y overflow-y-auto py-1">
											{#each filteredLanguages as lang}
												<button
													class="hover:bg-surface-600 flex w-full items-center justify-between px-4 py-2 text-left text-white {_languageTag === lang
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
									bind:value={_languageTag}
									onchange={handleSelectChange}
									class="preset-filled-surface-500 appearance-none! rounded-full text-white uppercase {sidebarState.sidebar.value.left === 'full'
										? 'btn-icon px-2.5 py-2'
										: 'btn-icon-sm px-1.5 py-0'}"
								>
									{#each availableLanguages as lang}
										<option value={lang} selected={lang === _languageTag}>{lang.toUpperCase()}</option>
									{/each}
								</select>
							{/if}
						</div>
					{/snippet}
					{#snippet content()}
						<div class="card preset-filled z-50 max-w-sm p-2">
							{m.applayout_systemlanguage()}
							<div class="arrow preset-filled"></div>
						</div>
					{/snippet}
				</Tooltip>
			</div>

			<!-- Light/Dark mode switch -->
			<div class={sidebarState.sidebar.value.left === 'full' ? 'order-2' : 'order-3'}>
				<Tooltip positioning={{ placement: 'right' }} openDelay={200}>
					{#snippet trigger()}
						<button onclick={toggleTheme} aria-label="Toggle Theme" class="btn-icon hover:bg-surface-500 hover:text-white">
							{#if themeName() === 'dark'}
								<iconify-icon icon="bi:sun" width="22"></iconify-icon>
							{:else}
								<iconify-icon icon="bi:moon-fill" width="22"></iconify-icon>
							{/if}
						</button>
					{/snippet}
					{#snippet content()}
						<div class="card preset-filled z-50 max-w-sm p-2">
							{m.applayout_switchmode({ $modeCurrent: themeName() === 'dark' ? 'Light' : 'Dark' })}
							<div class="arrow preset-filled"></div>
						</div>
					{/snippet}
				</Tooltip>
			</div>

			<!-- Sign Out -->
			<div class={sidebarState.sidebar.value.left === 'full' ? 'order-4' : 'order-4'}>
				<Tooltip positioning={{ placement: 'right' }} openDelay={200}>
					{#snippet trigger()}
						<button onclick={signOut} type="submit" value="Sign out" aria-label="Sign Out" class="btn-icon hover:bg-surface-500 hover:text-white">
							<iconify-icon icon="uil:signout" width="26"></iconify-icon>
						</button>
					{/snippet}
					{#snippet content()}
						<div class="card preset-filled z-50 max-w-sm p-2">
							{m.applayout_signout()}
							<div class="arrow preset-filled"></div>
						</div>
					{/snippet}
				</Tooltip>
			</div>

			<!-- System Configuration -->
			<div class={sidebarState.sidebar.value.left === 'full' ? 'order-5' : 'order-6'}>
				<Tooltip positioning={{ placement: 'right' }} openDelay={200}>
					{#snippet trigger()}
						<button
							onclick={() => {
								mode.set('view');
								handleSidebarToggle();
								if (get(screenSize) === 'sm') {
									toggleSidebar('left', 'hidden');
								}
							}}
							aria-label="System Configuration"
							class="btn-icon hover:bg-surface-500 pt-1.5 hover:text-white"
						>
							<a href="/config" aria-label="System Configuration">
								<iconify-icon icon="material-symbols:build-circle" width="32"></iconify-icon>
							</a>
						</button>
					{/snippet}
					{#snippet content()}
						<div class="card preset-filled z-50 max-w-sm p-2">
							{m.applayout_systemconfiguration()}
							<div class="arrow preset-filled"></div>
						</div>
					{/snippet}
				</Tooltip>
			</div>

			<!-- Github discussions -->
			<div class={sidebarState.sidebar.value.left === 'full' ? 'order-7' : 'order-7 hidden'}>
				<Tooltip positioning={{ placement: 'right' }} openDelay={200}>
					{#snippet trigger()}
						<a
							href="https://github.com/SveltyCMS/SveltyCMS/discussions"
							target="_blank"
							aria-label="Github Discussions"
							class="btn-icon hover:bg-surface-500 hover:text-white"
						>
							<iconify-icon icon="grommet-icons:github" width="30"></iconify-icon>
						</a>
					{/snippet}
					{#snippet content()}
						<div class="card preset-filled z-50 max-w-sm p-2">
							{m.applayout_githubdiscussion()}
							<div class="arrow preset-filled"></div>
						</div>
					{/snippet}
				</Tooltip>
			</div>

			<!-- CMS Version -->
			<div class={sidebarState.sidebar.value.left === 'full' ? 'order-6' : 'order-5'}>
				<a href="https://github.com/SveltyCMS/SveltyCMS/" target="blank">
					<span class="{sidebarState.sidebar.value.left === 'full' ? 'py-1' : 'py-0'} {$pkgBgColor} badge rounded-xl text-black hover:text-white"
						>{#if sidebarState.sidebar.value.left === 'full'}
							{m.applayout_version()}
						{/if}
						{pkg}
					</span>
				</a>
			</div>
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
		border: transparent;
	}
</style>
