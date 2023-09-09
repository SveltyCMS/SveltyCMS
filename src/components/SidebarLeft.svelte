<script lang="ts">
	import SimpleCmsLogo from './SimpleCMS_Logo.svelte';
	import Collections from './Collections.svelte';
	import type { Schema } from '@src/collections/types';
	import { page } from '$app/stores';
	import axios from 'axios';
	import { goto } from '$app/navigation';

	import {
		avatarSrc,
		contentLanguage,
		screenWidth,
		systemLanguage,
		toggleLeftSidebar,
		userPreferredState
	} from '@src/stores/store';

	import {
		Avatar,
		modeCurrent,
		setModeUserPrefers,
		popup,
		type PopupSettings,
		setModeCurrent
	} from '@skeletonlabs/skeleton';

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';
	import { locales } from '@src/i18n/i18n-util';
	import type { Locales } from '@src/i18n/i18n-types';
	import { setLocale } from '@src/i18n/i18n-svelte';
	import { get } from 'svelte/store';
	import { PUBLIC_SITENAME } from '$env/static/public';

	let selectedLocale = (localStorage.getItem('selectedLanguage') || $systemLanguage) as Locales;
	contentLanguage.set($page.params.language);

	let handleClick: any;

	// update the handleClick function when the systemLanguage store value changes
	$: handleClick = () => {
		if (!$page.url.href.includes('user')) {
			goto(`/user`);
		}
		if (get(screenWidth) === 'mobile') {
			toggleLeftSidebar.clickBack();
		}
	};

	// User Avatar
	const user = $page.data.user;
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
			$page.data.user = resp;
			goto(`/login`);
		}
	}

	function handleLocaleChange(e) {
		selectedLocale = e.target.value;
		setLocale(selectedLocale);
		localStorage.setItem('selectedLanguage', selectedLocale);
	}

	// @ts-expect-error reading from vite.config.jss
	const pkg = __VERSION__;

	// dark mode
	const toggleTheme = () => {
		$modeCurrent = !$modeCurrent;
		setModeUserPrefers($modeCurrent);
		setModeCurrent($modeCurrent);
	};

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
</script>

<!-- Corporate Identity Full-->
{#if $toggleLeftSidebar === 'full'}
	<a href="/" class="t flex pt-2 !no-underline">
		<SimpleCmsLogo fill="red" className="h-8" />

		<span class="pl-1 text-2xl font-bold text-black dark:text-white">{PUBLIC_SITENAME}</span>
	</a>
{:else}
	<!-- Corporate Identity Collapsed-->
	<div class="flex justify-start gap-1.5">
		<button
			type="button"
			on:click={() => toggleLeftSidebar.clickBack()}
			class="variant-ghost-surface btn-icon mt-1"
		>
			<iconify-icon icon="mingcute:menu-fill" width="24" />
		</button>

		<a href="/" class="flex pt-2 !no-underline">
			<SimpleCmsLogo fill="red" className="h-9  mr-2" />
		</a>
	</div>
{/if}

<!-- sidebar collapse button -->
<button
	type="button"
	class="absolute -right-3 top-4 flex items-center justify-center !rounded-full border-2 border-surface-300"
	on:keydown
	on:click={() => {
		toggleLeftSidebar.clickSwitchSideBar();
		userPreferredState.set($toggleLeftSidebar === 'full' ? 'collapsed' : 'full');
	}}
>
	{#if $toggleLeftSidebar !== 'full'}
		<!-- Icon Collapsed -->
		<iconify-icon
			icon="bi:arrow-left-circle-fill"
			width="30"
			class="rotate-180 rounded-full bg-white text-surface-500 hover:cursor-pointer hover:bg-error-600 dark:text-surface-600 dark:hover:bg-error-600"
		/>
	{:else}
		<!-- Icon expanded -->
		<iconify-icon
			icon="bi:arrow-left-circle-fill"
			width="30"
			class="rounded-full bg-white text-surface-500 hover:cursor-pointer hover:bg-error-600 dark:text-surface-600 dark:hover:bg-error-600"
		/>
	{/if}
</button>

<!--SideBar Middle -->
<Collections />

<!-- Sidebar Left Footer -->
<div
	class="mb-2 mt-auto bg-white dark:bg-gradient-to-r dark:from-surface-800 dark:via-surface-700 dark:to-surface-500"
>
	<div class="mx-1 mb-1 border-t border-surface-400" />

	<div
		class="{$toggleLeftSidebar === 'full'
			? 'grid-cols-3 grid-rows-3'
			: 'grid-cols-2 grid-rows-2'} grid items-center justify-center overflow-hidden"
	>
		<!-- Avatar with user settings -->
		<div class={$toggleLeftSidebar === 'full' ? 'order-1 row-span-2' : 'order-1'}>
			<button
				class="btn-icon md:row-span-2"
				use:popup={UserTooltip}
				on:click={handleClick}
				on:keypress={handleClick}
			>
				<button
					on:click={handleClick}
					on:keypress={handleClick}
					class="relative cursor-pointer flex-col !no-underline"
				>
					<Avatar
						src={$avatarSrc ? $avatarSrc : '/Default_User.svg'}
						class="mx-auto hover:bg-surface-500 hover:p-1 {$toggleLeftSidebar === 'full'
							? 'w-[40px]'
							: 'w-[35px]'}"
					/>
					<div class="-mt-1 text-center text-[9px] uppercase text-black dark:text-white">
						{#if $toggleLeftSidebar === 'full'}
							{#if user?.username}
								<div class="text-[10px] uppercase">{user?.username}</div>
							{/if}
						{/if}
					</div>
				</button>
				<div class="card variant-filled-secondary p-4" data-popup="User">
					{$LL.SBL_User()}
					<div class="variant-filled-secondary arrow" />
				</div>
			</button>
		</div>

		<!-- TODO: Fix Tooltip overflow -->
		<!-- System Language i18n Handling -->
		<div
			class={$toggleLeftSidebar === 'full' ? 'order-3 row-span-2  ' : 'order-2'}
			use:popup={SystemLanguageTooltip}
		>
			<select
				bind:value={selectedLocale}
				on:change={handleLocaleChange}
				class="{$toggleLeftSidebar === 'full'
					? 'px-2.5 py-2'
					: 'btn-icon-sm'} variant-filled-surface btn-icon appearance-none rounded-full uppercase text-white"
			>
				{#each locales as locale}
					<option value={locale} selected={locale === $systemLanguage}>{locale}</option>
				{/each}
			</select>
			<div class="card variant-filled-secondary p-4" data-popup="SystemLanguage">
				{$LL.SBL_SystemLanguage()}
				<div class="variant-filled-secondary arrow" />
			</div>
		</div>

		<!-- light/dark mode switch -->
		<div class="{$toggleLeftSidebar === 'full' ? 'order-2' : 'order-3'}  ">
			<button
				use:popup={SwitchThemeTooltip}
				on:click={toggleTheme}
				class="btn-icon hover:bg-surface-500 hover:text-white"
			>
				{#if !$modeCurrent}
					<iconify-icon icon="bi:sun" width="22" />
				{:else}
					<iconify-icon icon="bi:moon-fill" width="22" />
				{/if}

				<!-- TODO: tooltip overflow -->
			</button>

			<!-- Popup Tooltip with the arrow element -->
			<div class="card variant-filled-secondary p-2" data-popup="SwitchTheme">
				{`Switch to ${!$modeCurrent ? 'Light' : 'Dark'} Mode`}
				<div class="variant-filled-secondary arrow" />
			</div>
		</div>

		<!-- Lucia Sign Out -->
		<div class={$toggleLeftSidebar === 'full' ? 'order-4' : 'order-4'}>
			<button
				use:popup={SignOutTooltip}
				on:click={signOut}
				type="submit"
				value="Sign out"
				class="btn-icon hover:bg-surface-500 hover:text-white"
				><iconify-icon icon="uil:signout" width="26" /></button
			>

			<div class="card variant-filled-secondary z-10 p-2" data-popup="SignOutButton">
				{$LL.SBL_SignOut()}
				<div class="variant-filled-secondary arrow" />
			</div>
		</div>

		<!-- System Configuration -->
		<div class={$toggleLeftSidebar === 'full' ? 'order-5' : 'order-6'}>
			<button
				class="btn-icon pt-1.5 hover:bg-surface-500 hover:text-white"
				on:click={() => {
					if (get(screenWidth) === 'mobile') {
						toggleLeftSidebar.clickBack();
					}
				}}
			>
				<a href="/config" use:popup={ConfigTooltip}>
					<iconify-icon icon="material-symbols:build-circle" width="32" />
				</a>

				<div class="card variant-filled-secondary z-10 p-2" data-popup="Config">
					System Configuration
					<div class="variant-filled-secondary arrow" />
				</div>
			</button>
		</div>

		<!-- Github discussions -->
		<div class="{$toggleLeftSidebar === 'full' ? 'order-7' : 'order-7 hidden'} ">
			<a href="https://github.com/Rar9/SimpleCMS/discussions" target="blank">
				<button use:popup={GithubTooltip} class="btn-icon hover:bg-surface-500 hover:text-white">
					<iconify-icon icon="grommet-icons:github" width="30" />

					<div class="card variant-filled-secondary p-4" data-popup="Github">
						Github Discussion
						<div class="variant-filled-secondary arrow" />
					</div>
				</button>
			</a>
		</div>

		<!-- CMS Version -->
		<div class={$toggleLeftSidebar === 'full' ? 'order-6' : 'order-5'}>
			<a href="https://github.com/Rar9/SimpleCMS/" target="blank">
				<span
					class="{$toggleLeftSidebar === 'full'
						? 'py-1'
						: 'py-0'} variant-filled-primary badge rounded-xl text-black hover:text-white"
					>{#if $toggleLeftSidebar === 'full'}{$LL.SBL_Version()}{/if}{pkg}</span
				>
			</a>
		</div>
	</div>
</div>
