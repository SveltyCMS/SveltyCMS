<!-- 
 @file src/routes/+layout.svelte
 @description This Svelte component serves as the layout for the entire application. 
 It sets up the global theme, manages SEO metadata, and initializes required stores for the Skeleton UI framework.
 
 Features:
 - Dynamic theme management based on user preferences or defaults.
 - SEO optimization with Open Graph and Twitter Card metadata for enhanced social sharing.
 - Initialization of Skeleton stores for UI components.
 
 Usage:
 The layout wraps all routes and provides a consistent theme and structure across the application.
  -->

<script lang="ts">
	import { publicEnv } from '@root/config/public';

	// Stores
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	// Icons from https://icon-sets.iconify.design/
	import 'iconify-icon';

	// Importing the Paraglide SvelteKit component for animations
	import ParaglideSvelteKit from '@components/ParaglideSvelteKit.svelte';

	// Importing Tailwind CSS styles
	import '../app.postcss';

	// Initializing Skeleton stores
	import { initializeStores } from '@skeletonlabs/skeleton';
	initializeStores();

	// Exporting PageData for use in the component
	export let data: PageData;

	// Default SEO variables for the website's title and description
	const defaultTitle = `${publicEnv.SITE_NAME} - The Ultimate Headless CMS Powered by SvelteKit`;
	const defaultDescription = `${publicEnv.SITE_NAME} - a modern, powerful, and easy-to-use CMS powered by SvelteKit. Manage your content with ease & take advantage of the latest web technologies.`;

	// Reactive declarations for dynamic SEO content
	$: SeoTitle = $page.data.SeoTitle || defaultTitle;
	$: SeoDescription = $page.data.SeoDescription || defaultDescription;
	$: ogImage = $page.data.ogImage || '/SveltyCMS.png';
</script>

<svelte:head>
	<!-- Basic SEO -->
	<title>{SeoTitle}</title>
	<meta name="description" content={SeoDescription} />

	<!-- Open Graph Metadata -->
	<meta property="og:title" content={SeoTitle} />
	<meta property="og:description" content={SeoDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:image" content={ogImage} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:site_name" content={$page.url.origin} />

	<!-- Twitter Card Metadata -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={SeoTitle} />
	<meta name="twitter:description" content={SeoDescription} />
	<meta name="twitter:image" content={ogImage} />
	<meta property="twitter:domain" content={$page.url.origin} />
	<meta property="twitter:url" content={$page.url.href} />
</svelte:head>

<ParaglideSvelteKit>
	<slot />
</ParaglideSvelteKit>
