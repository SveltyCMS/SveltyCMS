/**
 * @file svelte.config.base.js
 * @description Shared SvelteKit configuration for all SveltyCMS workspaces
 *
 * This base configuration provides common settings that all workspaces can extend.
 * Workspaces import this and override/extend as needed.
 *
 * @example
 * // In workspace svelte.config.js:
 * import { getBaseSvelteConfig } from '../../svelte.config.base.js';
 * const config = getBaseSvelteConfig({ aliases: { '@custom': './src/custom' } });
 * export default config;
 */

import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Get base SvelteKit configuration
 *
 * @param {Object} options - Configuration options
 * @param {Object} [options.adapterOptions={}] - Adapter-specific options
 * @param {Object} [options.aliases={}] - Additional path aliases
 * @param {Object} [options.csp={}] - Additional CSP directives
 * @returns {import('@sveltejs/kit').Config} SvelteKit configuration
 */
export const getBaseSvelteConfig = (options = {}) => {
	const { adapterOptions = {}, aliases = {}, csp = {} } = options;

	return {
		// Enable Svelte 5 runes mode for better HMR and modern reactivity
		compilerOptions: {
			runes: true
		},

		// Default preprocessor (workspaces can add more)
		preprocess: [vitePreprocess()],

		kit: {
			// Node adapter for all workspaces
			adapter: adapter({
				out: 'build',
				precompress: true, // Enables gzip & brotli compression
				envPrefix: '',
				external: [
					// Prevent TypeScript tools from being bundled
					'typescript',
					'ts-node',
					'@typescript-eslint/parser',
					'@typescript-eslint/eslint-plugin'
				],
				polyfill: false,
				...adapterOptions
			}),

			// Shared path aliases (workspaces can extend)
			alias: {
				// Paraglide i18n
				$paraglide: './src/paraglide',

				// Shared libraries
				'@shared/theme': '../../shared/theme/src',
				'@shared/database': '../../shared/database/src',
				'@shared/utils': '../../shared/utils/src',
				'@shared/components': '../../shared/components/src',
				'@shared/hooks': '../../shared/hooks/src',
				'@shared/stores': '../../shared/stores/src',
				'@shared/paraglide': '../../shared/paraglide/src',
				'@shared/types': '../../shared/types/src',

				// Root resources
				'@config': '../../config',
				'@root': '../..',

				// Workspace-specific aliases
				...aliases,

				// Backward compatibility aliases
				'@databases': '../../shared/database/src',
				'@components': '../../shared/components/src',
				'@utils': '../../shared/utils/src',
				'@hooks': '../../shared/hooks/src',
				'@stores': '../../shared/stores/src',
				'@collections': '../../shared/database/src/collections',

				// Map legacy @src paths to new shared locations
				'@shared/databases': '../../shared/database/src',
				'@shared/components': '../../shared/components/src',
				'@shared/utils': '../../shared/utils/src',
				'@shared/hooks': '../../shared/hooks/src',
				'@shared/stores': '../../shared/stores/src',
				'@shared/services': '../../shared/services/src',
				'@shared/paraglide': '../../shared/paraglide/src',

				// CMS-specific content module (ContentManager, types, etc.)
				// These paths are relative to the consuming app (apps/cms/, apps/setup/)
				'@cms/content': './src/content',
				'@cms/content/*': './src/content/*',
				'@shared/routes': './src/routes',
				'@cms/routes/*': './src/routes/*',
				'@shared/widgets': './src/widgets',
				'@cms/widgets/*': './src/widgets/*',
				'@cms/content': './src/content',
				'@cms/content/*': './src/content/*'
			},

			// Shared CSP configuration
			csp: {
				mode: 'nonce',
				directives: {
					'default-src': ['self'],
					'script-src': ['self', 'unsafe-inline', 'unsafe-eval', 'blob:', 'https://*.iconify.design', 'https://code.iconify.design'],
					'worker-src': ['self', 'blob:'],
					'style-src': ['self', 'unsafe-inline', 'https://*.iconify.design'],
					'img-src': [
						'self',
						'data:',
						'blob:',
						'https://*.iconify.design',
						'https://*.simplesvg.com',
						'https://*.unisvg.com',
						'https://placehold.co',
						'https://api.qrserver.com',
						'https://github.com',
						'https://raw.githubusercontent.com'
					],
					'font-src': ['self', 'data:'],
					'connect-src': [
						'self',
						'https://*.iconify.design',
						'https://*.simplesvg.com',
						'https://*.unisvg.com',
						'https://code.iconify.design',
						'https://raw.githubusercontent.com',
						'wss:',
						'ws:'
					],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					...csp
				}
			} // csp
		}, // kit

		// Vite plugin options
		vitePlugin: {
			inspector: {
				toggleKeyCombo: 'meta-shift',
				holdMode: true,
				showToggleButton: 'always',
				toggleButtonPos: 'bottom-right'
			},
			experimental: {}
		}
	};
};

// Export default config for backward compatibility (root svelte.config.js)
export default getBaseSvelteConfig();
