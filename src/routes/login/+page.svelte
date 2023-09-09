<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import SignIn from './components/SignIn.svelte';
	import SignUp from './components/SignUp.svelte';
	import Logo from './components/icons/Logo.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
	//console.log('PageData', data);

	import { locales } from '@src/i18n/i18n-util';
	import type { Locales } from '@src/i18n/i18n-types';
	//console.log('locales', locales);
	import { systemLanguage } from '@src/stores/store';
	//console.log('systemLanguage', $systemLanguage);

	let selectedLocale = (localStorage.getItem('selectedLanguage') || $systemLanguage) as Locales;
	setLocale(selectedLocale);
	//console.log('selectedLocale', selectedLocale);

	import { setLocale } from '@src/i18n/i18n-svelte';
	//console.log('setLocale', setLocale);

	function handleLocaleChange(e) {
		selectedLocale = e.target.value;
		setLocale(selectedLocale);
		localStorage.setItem('selectedLanguage', selectedLocale);
		//console.log('selectedLocaleUpdated', selectedLocale);
	}

	let isFocused = false;

	function handleFocus() {
		isFocused = true;
	}

	function handleBlur() {
		isFocused = false;
	}

	let active: undefined | 0 | 1 = undefined;
	let background: 'white' | '#242728' = 'white';
</script>

<div class="body" style="background:{background} ">
	<SignIn
		{active}
		FormSchemaLogin={data.loginForm}
		FormSchemaForgot={data.forgotForm}
		FormSchemaReset={data.resetForm}
		on:click={() => (active = 0)}
		on:pointerenter={() => (background = '#242728')}
	/>

	<SignUp
		{active}
		FormSchemaSignUp={data.signUpForm}
		on:click={() => (active = 1)}
		on:pointerenter={() => (background = 'white')}
	/>
	{#if active == undefined}
		<!-- CSS Logo -->
		<div
			class="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 transform items-center justify-center"
		>
			<div class="relative top-[-150px] h-[170px] w-[170px] justify-center rounded-full bg-white">
				<svg
					width="160"
					height="160"
					class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform"
				>
					<circle
						cx="80"
						cy="80"
						r="75"
						stroke-width="2"
						stroke-dasharray="191 191"
						stroke-dashoffset="191"
						transform="rotate(51.5, 80, 80)"
						class="fill-none stroke-red-500"
					/>

					<circle
						cx="80"
						cy="80"
						r="75"
						stroke-width="2"
						stroke-dasharray="191 191"
						stroke-dashoffset="191"
						transform="rotate(231.5, 80, 80)"
						class="fill-none stroke-red-500"
					/>
				</svg>

				<svg
					width="170"
					height="170"
					class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform"
				>
					<circle
						cx="85"
						cy="85"
						r="80"
						stroke-width="2"
						stroke-dasharray="205 205"
						stroke-dashoffset="205"
						transform="rotate(50, 85, 85)"
						class="fill-none stroke-black"
					/>
					<circle
						cx="85"
						cy="85"
						r="80"
						stroke-width="2"
						stroke-dasharray="205 205"
						stroke-dashoffset="205"
						transform="rotate(230, 85, 85)"
						class="fill-none stroke-black"
					/>
				</svg>

				<div
					class="absolute left-1/2 top-[77px] flex -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center text-center"
				>
					<Logo fill="black" className="w-8 h-8" />
					<div class="text-3xl font-bold text-error-500">{PUBLIC_SITENAME}</div>
					<div class="-mt-[1px] text-[11px] font-bold text-black">with Sveltekit Power</div>
				</div>
			</div>
		</div>

		<!-- TODO: Fix Language switcher -->
		<div
			class="absolute bottom-1/4 left-1/2 flex -translate-x-1/2 -translate-y-1/2 transform cursor-pointer items-center justify-center rounded-full dark:text-black"
		>
			{#if locales.length > 5}
				<!-- Autocomplete input -->
				<input
					type="text"
					list="locales"
					on:input={handleLocaleChange}
					on:focus={handleFocus}
					on:blur={handleBlur}
					placeholder={selectedLocale}
					class="{isFocused
						? 'w-40'
						: 'w-20'} input rounded-full border-2 border-white bg-[#242728] uppercase text-white focus:ring-2"
				/>

				<datalist id="locales" class="w-full divide-y divide-white uppercase">
					{#each locales as locale}
						<option value={locale} class=" uppercase text-red-500">{locale}</option>
					{/each}
				</datalist>
			{:else}
				<!-- Dropdown select -->
				<select
					bind:value={selectedLocale}
					on:change={handleLocaleChange}
					class="rounded-full border-2 border-white bg-[#242728] uppercase text-white focus:ring-2 focus:ring-blue-500 active:ring active:ring-blue-300"
				>
					{#each locales as locale}
						<option value={locale} selected={locale === $systemLanguage}
							>{locale.toUpperCase()}
						</option>{/each}
				</select>
			{/if}
		</div>
	{/if}
</div>

<style lang="postcss">
	.body {
		width: 100vw;
		height: 100vh;
		display: flex;
		overflow: hidden;
		background: linear-gradient(90deg, #242728 50%, white 50%);
	}
</style>
