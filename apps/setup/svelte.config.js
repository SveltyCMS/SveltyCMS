/**
 * @file apps/setup/svelte.config.js
 * @description SvelteKit configuration for the Setup wizard application
 * 
 * Extends the base configuration with Setup-specific settings.
 * Setup wizard has minimal dependencies for fast installation.
 */

import { getBaseSvelteConfig } from '../../svelte.config.base.js';

/** @type {import('@sveltejs/kit').Config} */
const config = getBaseSvelteConfig({
	// Setup-specific adapter options
	adapterOptions: {
		out: 'build/setup'
	},
	
	// Setup-specific aliases (minimal)
	aliases: {
		'@setup': './src/lib'
	}
});

export default config;
