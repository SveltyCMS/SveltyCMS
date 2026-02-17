<!--
@file src/routes/+error.svelte
@component
**Displays an Error page for the SveltyCMS**

### Props:
- `error`: The error object containing status and message.

### Features:
- Dynamic display of error status and message based on the error encountered.
- Rotating animation effect for the site name to enhance visual appeal.
- Clear call-to-action link to return to the homepage.
- WCAG 2.2 AA Compliant + WCAG 3.0 Functional Performance focused

-->

<script lang="ts">
	// Components
	import SiteName from '@components/SiteName.svelte';
	import SveltyCMSLogo from '@components/system/icons/SveltyCMS_Logo.svelte';
	import * as m from '@src/paraglide/messages';
	// ParaglideJS
	import { app } from '@stores/store.svelte';
	// Stores
	import { page } from '$app/state';

	const size = 140;
	const font = 0.9;
	const repeat = 3;
	const separator = ' • ';

	const siteName = page.data?.settings?.SITE_NAME || 'SveltyCMS';
	const combinedString = Array.from({ length: repeat }, () => siteName + separator).join('');
	const array: string[] = combinedString.split('').filter((char) => char !== ' ');
	const patternLength = array.length / repeat;

	function isCMSChar(index: number): boolean {
		const posInPattern = index % patternLength;
		return posInPattern >= patternLength - 4 && posInPattern < patternLength - 1;
	}
</script>

<svelte:head> <title>{page.status} - {m.error_pagenotfound()} | {siteName}</title> </svelte:head>

{#if page}
	<main
		lang={app.contentLanguage}
		class="flex min-h-screen w-full flex-col items-center justify-center bg-linear-to-t from-surface-900 via-surface-700 to-surface-900 px-4 text-white"
		aria-labelledby="error-heading"
	>
		<!-- Skip to content link for keyboard users -->
		<a
			href="#error-content"
			class="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-surface-900 focus:outline-none focus:ring-2 focus:ring-primary-500"
		>
			{m.error_skip_content()}
		</a>

		<!-- Decorative Logo Section -->
		<div class="relative mb-12 grid place-items-center" style="width: {size}px; height: {size}px;" aria-hidden="true">
			<!-- Rotating SiteName -->
			<div class="animate-[spin_20s_linear_infinite] absolute inset-0 flex items-center justify-center" style="font-size: {font}em;">
				{#each array as char, index (index)}
					<div
						class="absolute left-1/2 top-0 h-full w-4 -translate-x-1/2 text-center font-bold uppercase leading-none"
						style="transform: translateX(-50%) rotate({(360 / array.length) * index}deg); transform-origin: center {size / 2}px;"
					>
						<SiteName {char} textClass={isCMSChar(index) ? 'text-primary-500' : 'text-white'} />
					</div>
				{/each}
			</div>

			<!-- Site Logo - Static, not rotating -->
			<div class="pointer-events-none z-10"><SveltyCMSLogo className="text-error-500 w-20 h-20" size={80} /></div>
		</div>

		<!-- Error Content -->
		<div id="error-content" class="flex flex-col items-center space-y-6 text-center">
			<!-- Error Status - Announced first to screen readers -->
			<div role="alert" aria-live="assertive" class="relative">
				<h1 id="error-heading" class="text-8xl font-extrabold tracking-wider text-white sm:text-9xl">{page.status}</h1>

				<!-- Error URL Banner -->
				<div
					class="mt-4 rounded-md bg-error-600/90 px-4 py-2 text-sm font-semibold text-white shadow-lg sm:absolute sm:left-1/2 sm:top-1/2 sm:mt-0 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rotate-12"
					aria-label="Error type"
				>
					<div class="max-w-[280px] truncate" title={page.url.toString()}>{page.url}</div>
					<div class="whitespace-nowrap">{m.error_pagenotfound()}</div>
				</div>
			</div>

			<!-- Error Message - High contrast for readability -->
			<p class="max-w-2xl text-2xl font-bold text-white sm:text-3xl">
				{#if page.error}
					{page.error.message}
				{:else}
					{m.error_wrong()}
				{/if}
			</p>

			<!-- Help Text -->
			<p class="text-lg text-surface-300">{m.error_page_moved()}</p>

			<!-- Action Buttons - Multiple recovery options -->
			<div class="flex flex-col items-center gap-4 sm:flex-row">
				<a
					href="/"
					class="inline-flex items-center gap-2 rounded-full bg-linear-to-br from-error-700 via-error-600 to-error-700 px-8 py-4 font-bold uppercase text-white shadow-xl transition-all hover:scale-105 hover:shadow-2xl focus:outline-none focus:ring-4 focus:ring-error-500/50 focus:ring-offset-2 focus:ring-offset-surface-900"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
						/>
					</svg>
					{m.error_gofrontpage()}
				</a>

				<button
					onclick={() => window.history.back()}
					class="inline-flex items-center gap-2 rounded-full border-2 border-surface-500 bg-transparent px-8 py-4 font-bold uppercase text-white transition-all hover:border-white hover:bg-white/10 focus:outline-none focus:ring-4 focus:ring-surface-500/50 focus:ring-offset-2 focus:ring-offset-surface-900"
				>
					<svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
					</svg>
					Go Back
				</button>
			</div>
		</div>
	</main>
{/if}

<style>
	/* Respect user preferences */
	@media (prefers-reduced-motion: reduce) {
		.animate-\[spin_20s_linear_infinite\] {
			animation: none !important;
		}
	}

	/* High contrast mode support */
	@media (prefers-contrast: high) {
		.animate-\[spin_20s_linear_infinite\] {
			animation: none !important;
		}
	}
</style>
