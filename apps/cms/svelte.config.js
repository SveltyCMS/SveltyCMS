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
		'@cms/components': '../../shared/components/src',
		'@cms/widgets': './src/widgets',
		'@content': './src/content',
		'@cms/content': './src/content',
		'@cms/config': './src/routes/config',
		'@cms/hooks': './src/hooks',
		'@cms-types': './src/types',
		'@cms/types': './src/types',
		'@cms': '../../shared/features/src', // Point generic @cms to shared features for now, or remove if unused
		'@api': './src/routes/api',
		'@config': '../../config',
		'@widgets': './src/widgets',
		$paraglide: './src/paraglide',
		'@shared/paraglide': './src/paraglide',
		'@shared/paraglide/*': './src/paraglide/*',
		'@shared/stores': '../../shared/stores/src',
		'@shared/stores/*': '../../shared/stores/src/*',
		'@shared/components': '../../shared/components/src',
		'@shared/components/*': '../../shared/components/src/*',
		'@shared/utils': '../../shared/utils/src',
		'@shared/utils/*': '../../shared/utils/src/*',
		'@shared/hooks/*': '../../shared/hooks/src/*',
		'@shared/database': '../../shared/database/src',
		'@shared/database/*': '../../shared/database/src/*',
		'@shared/services': '../../shared/services/src',
		'@shared/services/*': '../../shared/services/src/*',
		'@shared/theme': '../../shared/theme/src',
		'@shared/theme/*': '../../shared/theme/src/*',
		'@shared/paraglide': '../../shared/paraglide/src',
		'@shared/paraglide/*': '../../shared/paraglide/src/*'
	}
});

// Add CMS-specific preprocessing (enhanced images)
config.preprocess = [enhancedImages(), vitePreprocess()];

export default config;
