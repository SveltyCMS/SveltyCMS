<!--
@file src/routes/+error.svelte
@component
**Displays an Error page for the SveltyCMS**

### Props
- `error`: The error object containing status and message.

### Features:
- Dynamic display of error status and message based on the error encountered.
- Rotating animation effect for the site name to enhance visual appeal.
- Clear call-to-action link to return to the homepage.
-->

<script lang="ts">
	// Stores
	import { page } from '$app/state';
	// Components
	import SiteName from '@components/SiteName.svelte';
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	// ParaglideJS
	import { contentLanguage } from '@root/src/stores/store.svelte';
	import * as m from '@src/paraglide/messages';

	const speed = 100;
	const size = 140;
	const font = 0.9;
	const repeat = 3;
	const separator = ' • ';

	const siteName = page.data?.settings?.SITE_NAME || 'SveltyCMS';

	const combinedString = Array.from({ length: repeat }, () => siteName + separator).join('');

	const array: string[] = combinedString.split('').filter((char) => char !== ' ');

	// Helper function to check if character is part of "CMS"
	function isCMSChar(index: number): boolean {
		// Pattern: "SveltyCMS•" = 10 characters (including separator)
		// Characters at positions 6,7,8 in each repetition are "CMS"
		const posInPattern = index % 10;
		return posInPattern >= 6 && posInPattern < 9;
	}
</script>

{#if page}
	<main
		lang={$contentLanguage}
		class="bg-linear-to-t flex h-screen w-full flex-col items-center justify-center from-preset-900 via-preset-700 to-preset-900 text-white"
	>
		<div class="relative">
			<!-- Rotating SiteName -->
			<div
				class="relative animate-spin rounded-full"
				style="width: {size}px; height: {size}px; font-size: {font}em; animation-duration: {speed * 200}ms;"
			>
				{#each array as char, index (index)}
					<div
						class="absolute left-1/2 top-0 h-full w-4 -translate-x-1/2 text-center uppercase"
						style="transform: translateX(-50%) rotate({(1 / array.length) * index}turn);"
					>
						{#if isCMSChar(index)}
							<span class="text-primary-500"><SiteName {char} /></span>
						{:else}
							<SiteName {char} />
						{/if}
					</div>
				{/each}
			</div>

			<!-- Site Logo -->
			<SveltyCMSLogo fill="red" className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 h-16 mb-2" />
		</div>

		<div class="relative">
			<!-- Error class -->
			<h1 class="relative text-9xl font-extrabold tracking-widest text-white">
				{page.status}
			</h1>
			<!-- Error url  -->
			<div
				class="absolute left-1/2 top-1/2 mx-auto -translate-x-1/2 -translate-y-1/2 rotate-12 transform rounded-md bg-error-600/80 px-2 text-center text-sm font-bold text-white"
			>
				<div class=" min-w-[200px]">{page.url}</div>
				<div class="whitespace-nowrap">{m.error_pagenotfound()}</div>
			</div>
		</div>

		<h1 class="max-w-2xl text-center text-3xl font-extrabold tracking-widest text-surface-400">
			{#if page.error}
				{page.error.message}
			{/if}
		</h1>

		<p class="mt-2 text-lg text-white">{m.error_wrong()}</p>
		<!-- Button -->
		<a
			href="/"
			class="relative mt-5 block rounded-full bg-gradient-to-br from-error-700 via-error-600 to-error-700 px-8 py-4 font-bold uppercase !text-white shadow-xl"
		>
			{m.error_gofrontpage()}
		</a>
	</main>
{/if}
