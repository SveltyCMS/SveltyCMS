<script lang="ts">
	import { publicEnv } from '@root/config/public';
	import { page } from '$app/stores';
	import { theme, previewTheme } from '../stores/themeStore';

	// Icons from https://icon-sets.iconify.design/
	import 'iconify-icon';

	// Tailwind CSS
	import '../app.postcss';

	// Skeleton
	import { initializeStores } from '@skeletonlabs/skeleton';
	initializeStores();

	// Paraglide JS
	import ParaglideSvelteKit from '@components/ParaglideSvelteKit.svelte';

	// SEO
	const SeoTitle = `${publicEnv.SITE_NAME} - The Ultimate Headless CMS Powered by SvelteKit`;
	const SeoDescription = `${publicEnv.SITE_NAME} - a modern, powerful, and easy-to-use CMS powered by SvelteKit. Manage your content with ease & take advantage of the latest web technologies.`;

	// Reactive variables for themes
	let currentTheme: string;
	let currentPreviewTheme: string | null;

	// Default theme set to SveltyCMSTheme
	const defaultTheme = 'SveltyCMSTheme';
	theme.set(defaultTheme);

	// Import the default theme CSS
	import '../themes/SveltyCMS/SveltyCMSTheme.css';

	theme.subscribe((value) => {
		currentTheme = value;
		// loadThemeCSS(currentTheme);
		document.documentElement.setAttribute('data-theme', currentTheme);
	});

	previewTheme.subscribe((value) => {
		currentPreviewTheme = value;
		if (currentPreviewTheme) {
			// loadThemeCSS(currentPreviewTheme);
			document.documentElement.setAttribute('data-preview-theme', currentPreviewTheme);
		} else {
			document.documentElement.removeAttribute('data-preview-theme');
		}
	});

	// function loadThemeCSS(themeName: string) {
	//     switch(themeName) {
	//         case 'SveltyCMSTheme':
	//             import('../themes/SveltyCMS/SveltyCMSTheme.css');
	//             break;
	//         // For custom themes, we can use a pattern to load them dynamically
	//         default:
	//             const customThemePath = `../themes/custom/${themeName}/theme.css`;
	//             import(customThemePath)
	//                 .then(() => console.log(`${themeName} theme loaded successfully.`))
	//                 .catch(err => console.error(`Failed to load custom theme ${themeName}:`, err));
	//     }
	// }
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
