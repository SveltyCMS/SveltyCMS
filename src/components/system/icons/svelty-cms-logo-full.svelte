<!--
@file src/components/system/icons/svelty-cms-logo-full.svelte
@component
**Dynamic SveltyCMS_LogoFull component**
-->

<script lang="ts">
	//ParaglideJS

	import SiteName from '@src/components/site-name.svelte';
	import { logo_slogan } from '@src/paraglide/messages';
	import { publicEnv } from '@src/stores/global-settings.svelte';
	import Logo from './svelty-cms-logo.svelte';

	interface Props {
		siteName?: string;
	}

	const { siteName: propSiteName }: Props = $props();

	// Slogan resolution: an admin-set `SITE_SLOGAN` public setting wins; a blank value
	// (the seeded default) falls back to the translated `logo_slogan` catalog message.
	// Both branches resolve identically during SSR and hydration — `publicEnv` is empty on
	// the server, so SSR uses the translation and a custom value only appears in the
	// post-mount update, never as a hydration swap. No hardcoded literal fallback: the old
	// `'Content made simple'` string matched neither the EN nor any translated value.
	const slogan = $derived(publicEnv.SITE_SLOGAN || logo_slogan());
	const siteName = $derived(propSiteName || publicEnv.SITE_NAME || 'SveltyCMS');
</script>

<!-- CSS Logo - Removed <a> tag to prevent navigation interference -->
<div
	class="absolute inset-s-1/2 top-1/3 flex -translate-x-1/2 -translate-y-1/2 transform items-center justify-center"
>
	<!--White Inner Background -->
	<div class="relative flex h-42.5 w-42.5 items-center justify-center rounded-full bg-white">
		<!-- Red circle -->
		<svg
			aria-hidden="true"
			width="160"
			height="160"
			class="absolute inset-s-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform"
		>
			<circle
				cx="80"
				cy="80"
				r="75"
				stroke-width="2"
				stroke-dasharray="191 191"
				stroke-dashoffset="191"
				transform="rotate(51.5, 80, 80)"
				class="fill-none stroke-error-500"
			/>

			<circle
				cx="80"
				cy="80"
				r="75"
				stroke-width="2"
				stroke-dasharray="191 191"
				stroke-dashoffset="191"
				transform="rotate(231.5, 80, 80)"
				class="fill-none stroke-error-500"
			/>
		</svg>

		<!-- Black circle -->
		<svg
			aria-hidden="true"
			width="170"
			height="170"
			class="absolute inset-s-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform"
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
			class="absolute inset-s-1/2 top-17.5 flex -translate-x-1/2 -translate-y-1/2 transform flex-col items-center justify-center text-center"
		>
			<!-- Logo -->
			<Logo fill="red" className="w-14 h-14" />

			<!-- PUBLIC SITENAME -->
			<div class="-mt-2 text-3xl font-bold">
				<SiteName {siteName} highlight="CMS" textClass="text-black" />
			</div>
			<!-- Slogan -->
			<div class="-mt-px text-[13px] font-bold text-surface-500">{slogan}</div>
		</div>
	</div>
</div>
