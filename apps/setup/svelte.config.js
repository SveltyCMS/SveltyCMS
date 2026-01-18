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
		$paraglide: './src/paraglide',

		// Shared libraries (relative from apps/setup)
		'@shared/services': '../../apps/cms/src/services',
		'@shared/services/*': '../../apps/cms/src/services/*',

		// Cross-app access
		'@cms': '../../apps/cms/src',
		'@content': '../../apps/cms/src/content',
		'@widgets': '../../apps/cms/src/widgets',
		'@api': '../../apps/cms/src/routes/api',
		'@cms-types': '../../apps/cms/src/types',

		// Setup-specific
		'@setup': './src/lib'
	}
});

export default config;
