<script lang="ts">
	import type { ActionData, PageData } from './$types';
	import Logo from './components/icons/Logo.svelte';

	import Signin from './components/Signin.svelte';
	import SignUp from './components/Signup.svelte';
	import { PUBLIC_SITENAME } from '$env/static/public';
	import LocaleSwitcher from '$lib/LocaleSwitcher.svelte';

	export let data: PageData;

	const { firstUserExists } = data;

	let active: undefined | 0 | 1 = undefined;
	let background: 'white' | '#242728' = 'white';
</script>

<div class="body" style="background:{background} ">
	<Signin {active} on:click={() => (active = 0)} on:pointerenter={() => (background = 'white')} />
	<SignUp
		{active}
		on:click={() => (active = 1)}
		on:pointerenter={() => (background = '#242728')}
		{firstUserExists}
	/>
	{#if active == undefined}
		<!-- TODO: mobile Icon nor clickable, only text is -->
		<div
			class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform flex items-center justify-center"
		>
			<div class="bg-white relative top-[-150px] h-[170px] w-[170px] justify-center rounded-full">
				<svg
					viewBox="0 0 10 10"
					width="380"
					height="380"
					class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 transform"
				>
					<circle
						cx="5"
						cy="5"
						r="2"
						pathLength="2"
						stroke-width=".05"
						stroke-dasharray=".8 .2"
						stroke-dashoffset="9%"
						stroke-linecap="round"
						class="fill-none stroke-error-500"
					/>
					<circle
						cx="5"
						cy="5"
						r="1.9"
						pathLength="2"
						stroke-width=".05"
						stroke-dasharray=".8 .2"
						stroke-dashoffset="9%"
						stroke-linecap="round"
						class="fill-none stroke-surface-600"
					/>
				</svg>

				<div
					class="absolute top-[75px] left-1/2 -translate-x-1/2 -translate-y-1/2 transform  flex flex-col items-center justify-center text-center"
				>
					<Logo fill="black" className="w-8 h-8" />
					<div class="text-3xl font-bold text-error-500">{PUBLIC_SITENAME}</div>
					<div class="-mt-[1px] text-[11px] font-bold text-surface-600">with Sveltekit Power</div>
				</div>
			</div>
		</div>
		<!-- TODO:fix URL from en/login to /login for Language switcher -->
		<div
			class="absolute bottom-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 transform flex items-center justify-center"
		>
			<!-- <div class="text-surface-600 bg-white rounded-full p-1"><LocaleSwitcher /></div> -->
			<div class="text-surface-600 bg-white rounded-full p-1">DE</div>
		</div>
	{/if}
</div>

<style>
	.body {
		width: 100vw;
		min-height: 100vh;
		display: flex;
		background: linear-gradient(90deg, #242728 50%, white 50%);
		background-attachment: fixed; /* add this line to fix the gradient */
		overflow-y: auto;
	}
	:global(html, body, body > div, .body) {
		width: 100vw;
		height: 100vh;
	}
</style>
