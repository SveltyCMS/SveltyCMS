<script lang="ts">
	import { onMount } from 'svelte';
	import { publicEnv } from '@root/config/public';
	import { page } from '$app/stores';
	import { theme, previewTheme } from '../stores/themeStore';
	import type { PageData } from './$types';

	// Icons from https://icon-sets.iconify.design/
	import 'iconify-icon';

	// Tailwind CSS
	import '../app.postcss';

	// Skeleton
	import { initializeStores } from '@skeletonlabs/skeleton';
	initializeStores();

	// Paraglide JS
	import ParaglideSvelteKit from '@components/ParaglideSvelteKit.svelte';

	// Theme
	import { DEFAULT_THEME } from '@src/utils/utils';

	// SEO
	const SeoTitle = `${publicEnv.SITE_NAME} - The Ultimate Headless CMS Powered by SvelteKit`;
	const SeoDescription = `${publicEnv.SITE_NAME} - a modern, powerful, and easy-to-use CMS powered by SvelteKit. Manage your content with ease & take advantage of the latest web technologies.`;

	// Reactive variables for themes
	let currentTheme: string;
	let currentPreviewTheme: string | null;

	export let data: PageData;

	onMount(async () => {
		if (!data || !data.theme) {
			data.theme = DEFAULT_THEME;
		}
		theme.set(data.theme);
		await import(/* @vite-ignore */ data.theme.path);
		console.log(`Theme '${data.theme.name}' loaded.`);
	});

	theme.subscribe((value) => {
		currentTheme = value;
		document.documentElement.setAttribute('data-theme', currentTheme);
	});

	previewTheme.subscribe((value) => {
		currentPreviewTheme = value;
		if (currentPreviewTheme) {
			document.documentElement.setAttribute('data-preview-theme', currentPreviewTheme);
		} else {
			document.documentElement.removeAttribute('data-preview-theme');
		}
	});
</script>

<svelte:head>
	<!-- Basic SEO -->
	<title>{SeoTitle}</title>
	<meta name="description" content={SeoDescription} />

	<!-- Open Graph -->
	<meta property="og:title" content={SeoTitle} />
	<meta property="og:description" content={SeoDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="/SveltyCMS.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:site_name" content={$page.url.origin} />

	<!-- Open Graph : Twitter -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={SeoTitle} />
	<meta name="twitter:description" content={SeoDescription} />
	<meta name="twitter:image" content="/SveltyCMS.png" />
	<meta property="twitter:domain" content={$page.url.origin} />
	<meta property="twitter:url" content={$page.url.href} />
</svelte:head>

<ParaglideSvelteKit>
	<slot />
</ParaglideSvelteKit>
