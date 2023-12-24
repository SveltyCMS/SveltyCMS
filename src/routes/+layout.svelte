<script lang="ts">
	import { PUBLIC_SITENAME } from '$env/static/public';
	import { page } from '$app/stores';

	// Icons from https://icon-sets.iconify.design/
	import 'iconify-icon';

	// Your selected Skeleton theme:
	import '../app.postcss';

	//skeleton
	import { initializeStores } from '@skeletonlabs/skeleton';
	initializeStores();

	// Paraglide JS
	import ParaglideSvelteKit from '@components/ParaglideSvelteKit.svelte';

	// SEO
	const SeoTitle = `${PUBLIC_SITENAME} - powered with sveltekit`;
	const SeoDescription = `${PUBLIC_SITENAME} - a modern, powerful, and easy-to-use CMS powered by SvelteKit. Manage your content with ease & take advantage of the latest web technologies.`;
</script>

<svelte:head>
	<!--Basic SEO-->
	<title>{SeoTitle}</title>
	<meta name="description" content={SeoDescription} />

	<!-- Open Graph -->
	<meta property="og:title" content={SeoTitle} />
	<meta property="og:description" content={SeoDescription} />
	<meta property="og:type" content="website" />
	<meta property="og:image" content="/SveltyCMS_Logo_Round.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:site_name" content={$page.url.origin} />

	<!-- Open Graph : Twitter-->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={SeoTitle} />
	<meta name="twitter:description" content={SeoDescription} />
	<meta name="twitter:image" content="/SveltyCMS_Logo_Round.png" />
	<meta property="twitter:domain" content={$page.url.origin} />
	<meta property="twitter:url" content={$page.url.href} />
</svelte:head>

<ParaglideSvelteKit>
	<slot />
</ParaglideSvelteKit>
