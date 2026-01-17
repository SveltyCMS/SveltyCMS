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
		'@shared/components': '../../shared/components/src',
		'@shared/stores': '../../shared/stores/src',
		'@shared/utils': '../../shared/utils/src',
		'@shared/database': '../../shared/database/src',
		'@shared/services': '../../shared/services/src',
		'@shared/theme': '../../shared/theme/src',
		'@shared/paraglide': '../../shared/paraglide/src',

		// Legacy/Short aliases (optional, keeping for compatibility if utilized)
		'@components': '../../shared/components/src',
		'@stores': '../../shared/stores/src',
		'@utils': '../../shared/utils/src',
		'@databases': '../../shared/database/src',
		'@config': '../../config',

		// Cross-app access
		'@cms': '../../apps/cms/src',
		'@content': '../../apps/cms/src/content',
		'@widgets': '../../apps/cms/src/widgets',
		'@api': '../../apps/cms/src/routes/api',
		'@cms-types': '../../apps/cms/src/types',

		// CMS Aliases (Mirrored from apps/cms/svelte.config.js)
		'@cms/components': '../../apps/cms/src/lib/components',
		'@cms/widgets': '../../apps/cms/src/widgets',
		'@cms/content': '../../apps/cms/src/content',
		'@cms/config': '../../apps/cms/src/routes/config',
		'@cms/hooks': '../../apps/cms/src/hooks',
		'@cms/types': '../../apps/cms/src/types',
		'@cms': '../../apps/cms/src/lib',

		// Setup-specific
		'@setup': './src/lib'
	}
});

export default config;
