<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { goto } from '$app/navigation';
	import axios from 'axios';

	// Stores
	import { page } from '$app/stores';
	import { get } from 'svelte/store';
	import { screenWidth, toggleSidebar, sidebarState, userPreferredState } from '@src/stores/sidebarStore';

	// Components
	import SveltyCMSLogo from '@components/SveltyCMS_Logo.svelte';
	import Collections from '@components/Collections.svelte';

	//skeleton
	import { Avatar, popup, modeCurrent, type PopupSettings, setModeUserPrefers, setModeCurrent } from '@skeletonlabs/skeleton';

	// Popup Tooltips
	let UserTooltip: PopupSettings = {
		event: 'hover',
		target: 'User',
		placement: 'right'
	};

	let GithubTooltip: PopupSettings = {
		event: 'hover',
		target: 'Github',
		placement: 'right'
	};

	let SwitchThemeTooltip: PopupSettings = {
		event: 'hover',
		target: 'SwitchTheme',
		placement: 'right'
	};

	let SignOutTooltip: PopupSettings = {
		event: 'hover',
		target: 'SignOutButton',
		placement: 'right'
	};

	let ConfigTooltip: PopupSettings = {
		event: 'hover',
		target: 'Config',
		placement: 'right'
	};

	let SystemLanguageTooltip: PopupSettings = {
		event: 'hover',
		target: 'SystemLanguage',
		placement: 'right'
	};

	//ParaglideJS
	import * as m from '@src/paraglide/messages';
	import { languageTag } from '@src/paraglide/runtime';
	import { avatarSrc, pkgBgColor, systemLanguage } from '@src/stores/store';

	let _languageTag = languageTag(); // Get the current language tag

	function handleLocaleChange(event: any) {
		$systemLanguage = event.target.value;
	}
	let inputlangeuagevalue = '';
	$: filteredLanguages = publicEnv.AVAILABLE_SYSTEM_LANGUAGES.filter((value) => (value ? value.includes(inputlangeuagevalue) : true));

	let handleClick: any;

	// update the handleClick function when the systemLanguage store value changes
	$: handleClick = () => {
		if (!$page.url.href.includes('user')) {
			goto(`/user`);
		}
		if (get(screenWidth) === 'mobile') {
			toggleSidebar('left', 'hidden'); // Hide the left sidebar on mobile
		}
	};

	// Lucia
	const user = $page.data.user; //TODO update Username dynamically on change
	avatarSrc.set(user?.avatar);

	//signOut
	async function signOut() {
		let resp = (
			await axios.post(
				`/api/auth`,
				{ authType: 'signOut' },
				{
					headers: {
						'content-type': 'multipart/form-data'
					}
				}
			)
		).data;
		if (resp.status == 200) {
			await goto('/login', { invalidateAll: true, noScroll: true, replaceState: true });
		}
	}

	// @ts-expect-error reading from vite.config.js
	const pkg = __VERSION__;
	let githubVersion = '';

	// Fetch the latest release from GitHub
	axios
		.get('https://api.github.com/repos/Rar9/SveltyCMS/releases/latest')
		.then((response) => {
			githubVersion = response.data.tag_name.slice(1); // Remove the 'v' from the version tag

			const [localMajor, localMinor] = pkg.split('.').map(Number);
			const [githubMajor, githubMinor] = githubVersion.split('.').map(Number);

			if (githubMinor > localMinor) {
				$pkgBgColor = 'variant-filled-warning';
			} else if (githubMajor !== localMajor) {
				$pkgBgColor = 'variant-filled-error';
			}

			// console.log(`Local version: ${pkg}`);
			// console.log(`GitHub version: ${githubVersion}`);
			// console.log(`pkgBgColor: ${$pkgBgColor}`);
		})
		.catch((error) => {
			// Log the error to the console
			console.error('Error von Github Release found:', error);

			// Handle the error silently and use the current package.json version
			githubVersion = pkg;
			$pkgBgColor = 'variant-filled-tertiary';
		});

	const toggleTheme = () => {
		let currentMode = get(modeCurrent); // get the current value of the store
		let newMode = !currentMode; // toggle the mode
		setModeUserPrefers(newMode);
		setModeCurrent(newMode);
		localStorage.setItem('theme', newMode ? 'light' : 'dark');
	};
</script>

<div class="flex h-full w-full flex-col justify-between">
	<!-- Corporate Identity Full-->
	{#if $sidebarState.left === 'full'}
		<a href="/" class="t flex pt-2 !no-underline">
			<SveltyCMSLogo fill="red" className="h-8 rtl:ml-2 " />
			<span class="relative pl-1 text-2xl font-bold text-black dark:text-white">{publicEnv.SITE_NAME} </span>
		</a>
	{:else}
		<!-- Corporate Identity Collapsed-->
		<div class="flex justify-start gap-1.5">
			<button type="button" on:click={() => toggleSidebar('left', 'hidden')} class="variant-ghost-surface btn-icon mt-1">
				<iconify-icon icon="mingcute:menu-fill" width="24" />
			</button>

			<a href="/" class="flex justify-center pt-2 !no-underline">
				<SveltyCMSLogo fill="red" className="h-9 ltr:mr-2 rtl:ml-2" />
			</a>
		</div>
	{/if}

	<!-- Button to expand/collapse sidebar -->
	<button
		type="button"
		class="absolute top-4 z-20 flex items-center justify-center !rounded-full border-[3px] dark:border-black ltr:-right-3 rtl:-left-3"
		on:click={() => {
			toggleSidebar('left', $sidebarState.left === 'full' ? 'collapsed' : 'full');
			userPreferredState.set($sidebarState.left === 'full' ? 'collapsed' : 'full');
		}}
	>
		<iconify-icon
			icon="bi:arrow-left-circle-fill"
			width="30"
			class={`rounded-full bg-surface-500 text-white hover:cursor-pointer hover:bg-error-600 dark:bg-white dark:text-surface-600 dark:hover:bg-error-600 ${$sidebarState.left === 'full' ? 'rotate-0 rtl:rotate-180' : 'rotate-180 rtl:rotate-0'}`}
		/>
	</button>

	<!--SideBar Middle -->
	<Collections />

	<!-- Sidebar Left Footer -->
	<div class="mb-2 mt-auto bg-white dark:bg-gradient-to-r dark:from-surface-700 dark:to-surface-900">
		<div class="mx-1 mb-1 border-0 border-t border-surface-400" />

		<div
			class="{$sidebarState.left === 'full' ? 'grid-cols-3 grid-rows-3' : 'grid-cols-2 grid-rows-2'} grid items-center justify-center overflow-hidden"
		>
			<!-- Avatar with user settings -->
			<div class={$sidebarState.left === 'full' ? 'order-1 row-span-2' : 'order-1'}>
				<button
					use:popup={UserTooltip}
					on:click={handleClick}
					on:keypress={handleClick}
					class="btn-icon relative cursor-pointer flex-col items-center justify-center text-center !no-underline md:row-span-2"
				>
					<Avatar src={$avatarSrc ? $avatarSrc : '/Default_User.svg'} class="mx-auto {$sidebarState.left === 'full' ? 'w-[40px]' : 'w-[35px]'}" />
					<div class="-mt-1 text-center text-[10px] uppercase text-black dark:text-white">
						{#if $sidebarState.left === 'full'}
							{#if user?.username}
								<div class=" -ml-1.5">
									{user?.username}
								</div>
							{/if}
						{/if}
					</div>
				</button>
				<div class="card variant-filled-secondary p-4" data-popup="User">
					{m.applayout_userprofile()}
					<div class="variant-filled-secondary arrow" />
				</div>
			</div>

			<!-- TODO: Fix Tooltip overflow -->
			<!-- System Language i18n Handling -->
			<div class={$sidebarState.left === 'full' ? 'order-3 row-span-2  ' : 'order-2'} use:popup={SystemLanguageTooltip}>
				<select
					bind:value={_languageTag}
					on:change={handleLocaleChange}
					class="variant-filled-surface !appearance-none rounded-full uppercase text-white {$sidebarState.left === 'full'
						? 'btn-icon px-2.5 py-2'
						: 'btn-icon-sm px-1.5 py-0'}"
				>
					{#each filteredLanguages as locale}
						<option value={locale} selected={locale === _languageTag}>{locale.toUpperCase()}</option>
					{/each}
				</select>
				<div class="card variant-filled-secondary p-4" data-popup="SystemLanguage">
					{m.applayout_systemlanguage()}
					<div class="variant-filled-secondary arrow" />
				</div>
			</div>

			<!-- light/dark mode switch -->
			<div class="{$sidebarState.left === 'full' ? 'order-2' : 'order-3'}  ">
				<button
					use:popup={SwitchThemeTooltip}
					on:click={toggleTheme}
					aria-label="Toggle Theme"
					class="btn-icon hover:bg-surface-500 hover:text-white"
				>
					{#if !$modeCurrent}
						<iconify-icon icon="bi:sun" width="22" />
					{:else}
						<iconify-icon icon="bi:moon-fill" width="22" />
					{/if}

					<!-- Popup Tooltip with the arrow element -->
					<div class="card variant-filled-secondary overflow-auto py-2" data-popup="SwitchTheme">
						{m.applayout_switchmode({ $modeCurrent: !$modeCurrent ? 'Light' : 'Dark' })}
						<div class="variant-filled-secondary arrow" />
					</div>
				</button>
			</div>

			<!-- Lucia Sign Out -->
			<div class={$sidebarState.left === 'full' ? 'order-4' : 'order-4'}>
				<button use:popup={SignOutTooltip} on:click={signOut} type="submit" value="Sign out" class="btn-icon hover:bg-surface-500 hover:text-white">
					<iconify-icon icon="uil:signout" width="26" />
				</button>

				<div class="card variant-filled-secondary z-10 p-2" data-popup="SignOutButton">
					{m.applayout_signout()}
					<div class="variant-filled-secondary arrow" />
				</div>
			</div>

			<!-- System Configuration -->
			<div class={$sidebarState.left === 'full' ? 'order-5' : 'order-6'}>
				<button
					class="btn-icon pt-1.5 hover:bg-surface-500 hover:text-white"
					use:popup={ConfigTooltip}
					on:click={() => {
						if (get(screenWidth) === 'mobile') {
							toggleSidebar('left', 'hidden');
						}
					}}
				>
					<a href="/config">
						<iconify-icon icon="material-symbols:build-circle" width="32" />
					</a>

					<div class="card variant-filled-secondary z-10 p-2" data-popup="Config">
						{m.applayout_systemconfiguration()}
						<div class="variant-filled-secondary arrow" />
					</div>
				</button>
			</div>

			<!-- Github discussions -->
			<div class="{$sidebarState.left === 'full' ? 'order-7' : 'order-7 hidden'} ">
				<a href="https://github.com/Rar9/SveltyCMS/discussions" target="blank">
					<button use:popup={GithubTooltip} class="btn-icon hover:bg-surface-500 hover:text-white">
						<iconify-icon icon="grommet-icons:github" width="30" />

						<div class="card variant-filled-secondary p-4" data-popup="Github">
							{m.applayout_githubdiscussion()}
							<div class="variant-filled-secondary arrow" />
						</div>
					</button>
				</a>
			</div>

			<!-- CMS Version -->
			<div class={$sidebarState.left === 'full' ? 'order-6' : 'order-5'}>
				<a href="https://github.com/Rar9/SveltyCMS/" target="blank">
					<span class="{$sidebarState.left === 'full' ? 'py-1' : 'py-0'} {$pkgBgColor} badge rounded-xl text-black hover:text-white"
						>{#if $sidebarState.left === 'full'}{m.applayout_version()}{/if}
						{pkg}
					</span>
				</a>
			</div>
		</div>
	</div>
</div>
