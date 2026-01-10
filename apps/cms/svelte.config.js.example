/**
 * @file apps/cms/svelte.config.js
 * @description SvelteKit configuration for the CMS application
 * 
 * Extends the base configuration with CMS-specific settings.
 */

import { getBaseSvelteConfig } from '../../svelte.config.base.js';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = getBaseSvelteConfig({
	// CMS-specific adapter options
	adapterOptions: {
		out: 'build/cms'
	},
	
	// CMS-specific aliases
	aliases: {
		'@cms': './src/lib',
		'@cms/components': './src/components',
		'@api': './src/routes/api',
		'@widgets': '../../shared/widgets/src'
	}
});

// Add CMS-specific preprocessing (enhanced images)
config.preprocess = [enhancedImages(), vitePreprocess()];

export default config;
