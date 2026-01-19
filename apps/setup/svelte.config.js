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

	// Setup-specific aliases
	aliases: {
		// Local paraglide (generated per-app)
		$paraglide: './src/lib/paraglide',

		// Shared libraries
		'@shared/services': '../../shared/services/src',
		'@shared/services/*': '../../shared/services/src/*',

		// Setup-specific
		'@setup': './src'
	}
});

export default config;
