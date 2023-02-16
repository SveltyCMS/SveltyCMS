<script lang="ts">
	import { page } from '$app/stores';
	import SimpleCmsLogo from '$src/components/icons/SimpleCMS_Logo.svelte';
	import { PUBLIC_SITENAME } from '$env/static/public';

	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	let speed = 50;
	let size = 130;
	let font = 0.8;
	let text = PUBLIC_SITENAME;
	let repeat = 3;
	let separator = ' • ';

	let array: any = [];
	$: array = [...Array(repeat)].map((_) => [...text].concat([...separator])).flat();
</script>

{#if $page}
	<main
		class="flex h-screen w-full flex-col items-center justify-center bg-gradient-to-t from-surface-900 via-surface-700 to-surface-900"
	>
		<div class="relative">
			<div
				class="absolute seal"
				style="--size: {size}px; --speed: {speed * 1000}ms; --font: {font}em"
			>
				{#each array as char, index}
					<div class="char" style="--angle: {`${(1 / array.length) * index}turn`}">{char}</div>
				{/each}
			</div>
			<SimpleCmsLogo
				fill="red"
				className="absolute top-[50%] -translate-y-[50%] translate-x-[50%] left-0 h-16 mb-2"
			/>
		</div>

		<div class="relative">
			<!-- error class -->
			<h1 class="relative !text-9xl font-extrabold tracking-widest text-white">
				{$page.status}
			</h1>
			<!-- error url  -->
			<div
				class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 rotate-12 mx-auto text-center rounded-md bg-error-600/80 px-2 text-sm font-bold text-white whitespace-nowrap"
			>
				<div class="">{$page.url}</div>
				<div class="flex-nowrap whitespace-nowrap">{$LL.ERROR_Pagenotfound()}</div>
			</div>
		</div>

		<h1 class="text-5xl font-extrabold tracking-widest text-surface-400">
			{#if $page.error} {$page.error.message} {/if}
		</h1>

		<p class="text-lg text-white">{$LL.ERROR_Wrong()}</p>
		<a
			href="/"
			data-sveltekit-preload-data="tap"
			class="relative mt-5 block rounded-full bg-gradient-to-br from-error-700 via-error-600 to-error-700 px-8 py-4 font-bold uppercase !text-white shadow-xl"
			>{$LL.ERROR_GoHome()}</a
		>
	</main>
{/if}

<style>
	@keyframes rotation {
		0% {
			transform: rotate(0turn);
		}
		100% {
			transform: rotate(1turn);
		}
	}

	.seal {
		position: relative;
		width: var(--size);
		height: var(--size);
		border-radius: 100%;
		animation: rotation var(--speed) linear infinite;
		font-size: var(--font);
	}
	.char {
		width: 1em;
		height: 100%;
		position: absolute;
		top: 0;
		left: 50%;
		transform: translateX(-50%) rotate(var(--angle, 0deg));
		text-align: center;
		text-transform: uppercase;
	}
</style>
