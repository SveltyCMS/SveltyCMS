/**
 * @file apps/cms/svelte.config.js
 * @description SvelteKit configuration for the CMS application
 *
 * Extends the base configuration with CMS-specific settings.
 */

import { getBaseSvelteConfig } from '../../svelte.config.base.js';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = getBaseSvelteConfig({
	// CMS-specific adapter options
	adapterOptions: {
		out: 'build/cms'
	},

	// CMS-specific aliases
	aliases: {
		'@cms/components': './src/components',
		'@cms/widgets': './src/widgets',
		'@cms/dashboard': '../../shared/features/src/dashboard',
		'@content': './src/content',
		'@cms/content': './src/content',
		'@cms/config': './src/routes/config',
		'@cms/hooks': './src/hooks',
		'@cms-types': './src/types',
		'@cms/types': './src/types',
		'@cms/stores': './src/stores',
		'@cms/mediagallery': '../../shared/features/src/mediagallery',
		'@cms': './src',
		'@api': './src/routes/api',
		'@config': '../../config',
		'@widgets': './src/widgets',
		$paraglide: './src/paraglide',
		'@shared/services': './src/services',
		'@shared/services/*': './src/services/*'
	},
	// CMS-specific CSP overrides
	csp: {
		'frame-src': ['self', 'https://localhost:*', 'http://localhost:*']
	}
});

// Add CMS-specific preprocessing
config.preprocess = [vitePreprocess()];

export default config;
