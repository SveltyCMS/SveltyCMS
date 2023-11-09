<script lang="ts">
	// Your selected Skeleton theme:
	import '../../app.postcss';

	// Icons from https://icon-sets.iconify.design/
	import 'iconify-icon';

	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		avatarSrc,
		collections,
		collection,
		collectionValue,
		mode,
		modifyEntry,
		defaultContentLanguage,
		handleSidebarToggle,
		screenWidth,
		userPreferredState,
		toggleLeftSidebar,
		toggleRightSidebar,
		togglePageHeader,
		togglePageFooter,
		storeListboxValue,
		systemLanguage,
		pkgBgColor
	} from '@src/stores/store';

	import { getCollections } from '@src/collections';

	// Use handleSidebarToggle as a reactive statement to automatically switch the correct sidebar
	$: handleSidebarToggle;

	import { contentLanguage } from '@src/stores/store';

	//smooth view transitions via browser (only chrome)
	import { onNavigate } from '$app/navigation';
	onNavigate((navigation) => {
		if (!(document as any).startViewTransition) return;

		return new Promise((resolve) => {
			(document as any).startViewTransition(async () => {
				resolve();
				await navigation.complete;
			});
		});
	});

	import axios from 'axios';
	import SimpleCmsLogo from '@src/components/SimpleCMS_Logo.svelte';
	import { PUBLIC_SITENAME } from '$env/static/public';
	import ControlPanel from '@src/components/ControlPanel.svelte';
	import Collections from '@src/components/Collections.svelte';
	import { getDates } from '@src/utils/utils';

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

	// typesafe-i18n
	import LL from '@src/i18n/i18n-svelte';
	import { locales } from '@src/i18n/i18n-util';
	import type { Locales } from '@src/i18n/i18n-types';
	import { setLocale } from '@src/i18n/i18n-svelte';

	let selectedLocale = (localStorage.getItem('selectedLanguage') || $systemLanguage) as Locales;

	function handleLocaleChange(e) {
		selectedLocale = e.target.value;
		setLocale(selectedLocale);
		localStorage.setItem('selectedLanguage', selectedLocale);
	}

	// @ts-expect-error reading from vite.config.jss
	const pkg = __VERSION__;
	let githubVersion = '';

	// Fetch the latest release from GitHub
	axios
		.get('https://api.github.com/repos/Rar9/SimpleCMS/releases/latest')
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
		.catch((error) => console.error('Error:', error));

	// dark mode
	const toggleTheme = () => {
		$modeCurrent = !$modeCurrent;
		setModeUserPrefers($modeCurrent);
		setModeCurrent($modeCurrent);
	};

	// Lucia
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
			goto(`/login`);
		}
	}

	//skeleton
	import { initializeStores, AppShell, Avatar, Modal, getModalStore, popup, Toast, setModeUserPrefers, setModeCurrent } from '@skeletonlabs/skeleton';
	initializeStores();

	import { modeCurrent } from '@skeletonlabs/skeleton';
	import type { PopupSettings, ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';

	//required for popups to function
	import { computePosition, autoUpdate, offset, shift, flip, arrow } from '@floating-ui/dom';
	import { storePopup } from '@skeletonlabs/skeleton';
	storePopup.set({ computePosition, autoUpdate, offset, shift, flip, arrow });

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

	import HeaderControls from '@src/components/HeaderControls.svelte';

	import { onMount, tick } from 'svelte';
	import { get } from 'svelte/store';
	import type { Schema } from '@src/collections/types';
	import Loading from '@src/components/Loading.svelte';
	import MultibuttonToken from './user/components/MultibuttonToken.svelte';

	let dates = { created: '', updated: '', revision: '' };

	// Declare a ForwardBackward variable to track whether the user is navigating using the browser's forward or backward buttons
	let ForwardBackward: boolean = false;

	globalThis.onpopstate = async () => {
		// Set up an event listener for the popstate event
		ForwardBackward = true; // Set ForwardBackward to true to indicate that the user is navigating using the browser's forward or backward buttons

		// Update the value of the collection store based on the current page's collection parameter
		collection.set($collections.find((x) => x.name === $page.params.collection) as Schema);
	};

	// Subscribe to changes in the collection store and do redirects
	let initial = true;
	collection.subscribe((_) => {
		// console.log(!$collection, !$page.params.language);
		if (!$collection) return;

		// Reset the value of the collectionValue store
		$collectionValue = {};

		if (!ForwardBackward && initial != true) {
			// If ForwardBackward is false and the current route is a collection route
			goto(`/${$contentLanguage || defaultContentLanguage}/${$collection.name}`);
		}
		initial = false;
		// Reset ForwardBackward to false
		ForwardBackward = false;
	});

	// onMount(async () => {
	// 	try {
	// 		dates = await getDates($collection.name);
	// 	} catch (error) {
	// 		console.error(error);
	// 	}
	// });

	// SEO
	const SeoTitle = `${PUBLIC_SITENAME} - powered with sveltekit`;
	const SeoDescription = `${PUBLIC_SITENAME} - a modern, powerful, and easy-to-use CMS powered by SvelteKit. Manage your content with ease & take advantage of the latest web technologies.`;
</script>

<!-- <div>
	Mode <span class="font-bold text-primary-500">{$mode}</span>
</div> -->
<!-- TODO: Fix Right And mobile Version of sidebars -->
<!-- <div
	class="flex flex-wrap justify-center
 text-xs"
>
	<div class="mx-2 flex flex-col items-center">
		Mode
		<div class="font-bold text-primary-500">{$mode}</div>
	</div>
	<div class="mx-2 flex flex-col items-center">
		ModifyEntry
		<div class="font-bold text-primary-500">{$modifyEntry}</div>
	</div>
	<div class="mx-2 flex flex-col items-center">
		screenWidth
		<div class="font-bold text-primary-500">{$screenWidth}</div>
	</div>
	<div class="mx-2 flex flex-col items-center">
		userPreferredState
		<div class="font-bold text-primary-500">{$userPreferredState}</div>
	</div>
	<div class="mx-2 flex flex-col items-center">
		toggleLeftSidebar
		<div class="font-bold text-primary-500">{$toggleLeftSidebar}</div>
	</div>
	<div class="mx-2 flex flex-col items-center">
		toggleRightSidebar
		<div class="font-bold text-primary-500">{$toggleRightSidebar}</div>
	</div>
	<div class="mx-2 flex flex-col items-center">
		togglePageHeader
		<div class="font-bold text-primary-500">{$togglePageHeader}</div>
	</div>
	<div class="mx-2 flex flex-col items-center">
		togglePageFooter
		<div class="font-bold text-primary-500">{$togglePageFooter}</div>
	</div>
		<div class="mx-2 flex flex-col items-center">
		storeListboxValue
		<div class="font-bold text-primary-500">{$storeListboxValue}</div>
	</div>
</div> -->

<svelte:head>
	<!--Basic SEO-->
	<title>{SeoTitle}</title>
	<meta name="description" content={SeoDescription} />

	<!-- Open Graph -->
	<meta property="og:title" content={SeoTitle} />
	<meta property="og:description" content={SeoDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="/SimpleCMS_Logo_Round.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:site_name" content={$page.url.origin} />

	<!-- Open Graph : Twitter-->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={SeoTitle} />
	<meta name="twitter:description" content={SeoDescription} />
	<meta name="twitter:image" content="/SimpleCMS_Logo_Round.png" />
	<meta property="twitter:domain" content={$page.url.origin} />
	<meta property="twitter:url" content={$page.url.href} />
</svelte:head>

<!-- Wait for dynamic Collection import -->
<!-- TODO: Optimize this as this is not needed for ever page -->
{#await getCollections()}
	<div class="flex h-screen items-center justify-center">
		<Loading />
	</div>
{:then}
	<!-- hack as root +layout cannot be overwritten ? -->
	{#if $page.url.pathname === '/login'}
		<slot />
	{:else}
		<AppShell
			slotSidebarLeft="pt-2 !overflow-visible bg-white dark:bg-gradient-to-r dark:from-surface-900 dark:via-surface-700
dark:to-surface-500 text-center h-full relative border-r !px-2 border-surface-300 flex flex-col z-10
{$toggleLeftSidebar === 'full' ? 'w-[220px]' : 'w-fit'}
{$toggleLeftSidebar === 'closed' ? 'hidden' : 'block'}
lg:overflow-y-scroll lg:max-h-screen}"
			slotSidebarRight="h-full relative border-r w-[200px] flex flex-col items-center bg-white border-l border-surface-300 dark:bg-gradient-to-r dark:from-surface-600 dark:via-surface-700 dark:to-surface-900 text-center
	{$toggleRightSidebar === 'closed' ? 'hidden' : 'block'}"
			slotPageHeader="relative bg-white dark:bg-gradient-to-t dark:from-surface-600 dark:via-surface-700 dark:to-surface-900 text-center px-1  border-b 
	{$togglePageHeader === 'closed' ? 'hidden' : 'block'}"
			slotPageFooter="relative bg-white dark:bg-gradient-to-b dark:from-surface-600 dark:via-surface-700 dark:to-surface-900 text-center px-1  border-t 
	{$togglePageFooter === 'closed' ? 'hidden' : 'block'}"
		>
			<svelte:fragment slot="sidebarLeft">
				<!-- Corporate Identity Full-->
				{#if $toggleLeftSidebar === 'full'}
					<a href="/" class="t flex pt-2 !no-underline">
						<SimpleCmsLogo fill="red" className="h-8" />

						<span class="pl-1 text-2xl font-bold text-black dark:text-white">{PUBLIC_SITENAME}</span>
					</a>
				{:else}
					<!-- Corporate Identity Collapsed-->
					<div class="flex justify-start gap-1.5">
						<button type="button" on:click={() => toggleLeftSidebar.clickBack()} class="variant-ghost-surface btn-icon mt-1">
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
				<div class="mb-2 mt-auto bg-white dark:bg-gradient-to-r dark:from-surface-800 dark:via-surface-700 dark:to-surface-500">
					<div class="mx-1 mb-1 border-t border-surface-400" />

					<div
						class="{$toggleLeftSidebar === 'full'
							? 'grid-cols-3 grid-rows-3'
							: 'grid-cols-2 grid-rows-2'} grid items-center justify-center overflow-hidden"
					>
						<!-- Avatar with user settings -->
						<div class={$toggleLeftSidebar === 'full' ? 'order-1 row-span-2' : 'order-1'}>
							<button class="btn-icon md:row-span-2" use:popup={UserTooltip} on:click={handleClick} on:keypress={handleClick}>
								<button on:click={handleClick} on:keypress={handleClick} class="relative cursor-pointer flex-col !no-underline">
									<Avatar
										src={$avatarSrc ? $avatarSrc : '/Default_User.svg'}
										class="mx-auto hover:bg-surface-500 hover:p-1 {$toggleLeftSidebar === 'full' ? 'w-[40px]' : 'w-[35px]'}"
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
						<div class={$toggleLeftSidebar === 'full' ? 'order-3 row-span-2  ' : 'order-2'} use:popup={SystemLanguageTooltip}>
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
							<button use:popup={SwitchThemeTooltip} on:click={toggleTheme} class="btn-icon hover:bg-surface-500 hover:text-white">
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
							>
								<iconify-icon icon="uil:signout" width="26" />
							</button>

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
									{$LL.SBL_Configuration()}
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
										{$LL.SBL_GithubDiscussion()}
										<div class="variant-filled-secondary arrow" />
									</div>
								</button>
							</a>
						</div>

						<!-- CMS Version -->
						<div class={$toggleLeftSidebar === 'full' ? 'order-6' : 'order-5'}>
							<a href="https://github.com/Rar9/SimpleCMS/" target="blank">
								<span class="{$toggleLeftSidebar === 'full' ? 'py-1' : 'py-0'} {$pkgBgColor} badge rounded-xl text-black hover:text-white"
									>{#if $toggleLeftSidebar === 'full'}{$LL.SBL_Version()}{/if}{pkg}</span
								>
							</a>
						</div>
					</div>
				</div>
			</svelte:fragment>

			<svelte:fragment slot="sidebarRight">
				<ControlPanel />
			</svelte:fragment>

			<svelte:fragment slot="pageHeader">
				<HeaderControls />
			</svelte:fragment>

			<!-- Router Slot -->
			<Modal />
			<Toast />
			<div class="m-2">
				{#key $page.url}
					<!-- <div in:fly|global={{ x: -200, duration: 200 }} out:fly|global={{ x: 200, duration: 200 }}> -->
					<div>
						<slot />
					</div>
				{/key}
			</div>

			<svelte:fragment slot="pageFooter">
				{#if $mode !== 'view'}
					<h2 class="text-center !text-sm font-bold uppercase text-primary-500">
						{$collection.name} Info:
					</h2>

					<div class="mb-1 mt-2 grid grid-cols-3 items-center gap-x-2 text-[12px] leading-tight">
						<!-- Labels -->
						{#each Object.keys(dates) as key}
							<div class="capitalize">{key}:</div>
						{/each}
						<!-- Data -->
						{#each Object.values(dates) as value}
							<div class="text-primary-500">{value}</div>
						{/each}
					</div>
				{/if}
			</svelte:fragment>
		</AppShell>
	{/if}
{:catch error}
	<div class="text-error-500">
		An error occurred: {error.message}
	</div>
{/await}
