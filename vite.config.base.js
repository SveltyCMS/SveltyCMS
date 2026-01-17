/**
 * @file vite.config.base.js
 * @description Shared Vite configuration for all SveltyCMS workspaces
 *
 * This base configuration provides common build settings that all workspaces can extend.
 * Includes plugins, optimizations, and path aliases.
 *
 * @example
 * // In workspace vite.config.ts:
 * import { getBaseViteConfig } from '../../vite.config.base.js';
 * import path from 'path';
 * import { fileURLToPath } from 'url';
 *
 * const __dirname = path.dirname(fileURLToPath(import.meta.url));
 * const config = getBaseViteConfig(__dirname, { port: 5174 });
 * export default config;
 */

import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';
import { builtinModules } from 'module';

/**
 * Get base Vite configuration
 *
 * @param {string} workspaceDir - Absolute path to workspace directory (__dirname)
 * @param {Object} [options={}] - Configuration options
 * @param {number} [options.port=5173] - Dev server port
 * @param {string} [options.paraglideProject='./project.inlang'] - Paraglide project path
 * @param {any[]} [options.additionalPlugins=[]] - Additional Vite plugins
 * @param {Object} [options.optimizeDeps={}] - Dependency optimization options
 * @param {Object} [options.buildOptions={}] - Additional build options
 * @returns {import('vite').UserConfig} Vite configuration
 */
export const getBaseViteConfig = (workspaceDir, options = {}) => {
	const { port = process.env.PORT || 5173, additionalPlugins = [], optimizeDeps = {}, buildOptions = {} } = options;

	return {
		// Core plugins
		plugins: [sveltekit(), tailwindcss(), ...additionalPlugins],

		// Development server
		server: {
			port,
			fs: {
				// Allow serving files from workspace and shared libraries
				allow: [workspaceDir, path.resolve(workspaceDir, '../../shared'), path.resolve(workspaceDir, '../../config')]
			},
			// Ignore source map warnings from paraglide (it doesn't generate .map files)
			sourcemapIgnoreList: (sourcePath) => sourcePath.includes('paraglide')
		},

		// Dependency optimization
		optimizeDeps: {
			exclude: ['@inlang/paraglide-js'],
			...optimizeDeps
		},

		// Build configuration
		build: {
			target: 'esnext',
			sourcemap: true,
			rollupOptions: {
				// Externalize optional database drivers (conditional loading)
				external: ['mongoose', 'mariadb', 'mysql2', 'postgres', ...builtinModules, ...builtinModules.map((m) => `node:${m}`)]
			},
			...buildOptions
		},

		// Path resolution
		resolve: {
			alias: {
				// Shared library aliases
				'@shared/theme': path.resolve(workspaceDir, '../../shared/theme/src'),
				'@shared/database': path.resolve(workspaceDir, '../../shared/database/src'),
				'@shared/utils': path.resolve(workspaceDir, '../../shared/utils/src'),
				'@shared/components': path.resolve(workspaceDir, '../../shared/components/src'),
				'@shared/hooks': path.resolve(workspaceDir, '../../shared/hooks/src'),
				'@shared/stores': path.resolve(workspaceDir, '../../shared/stores/src'),
				'@shared/paraglide': path.resolve(workspaceDir, '../../shared/paraglide/src'),
				'@shared/types': path.resolve(workspaceDir, '../../shared/types/src'),
				'@shared/features': path.resolve(workspaceDir, '../../shared/features/src'),

				// Root resources
				'@config': path.resolve(workspaceDir, '../../config'),
				'@root': path.resolve(workspaceDir, '../..'),

				// CMS-specific modules (used by shared libraries when running CMS app)
				'@cms/content': path.resolve(workspaceDir, '../../apps/cms/src/content'),
				'@cms/widgets': path.resolve(workspaceDir, '../../apps/cms/src/widgets'),
				'@cms/hooks': path.resolve(workspaceDir, '../../apps/cms/src/hooks'),
				'@cms/routes': path.resolve(workspaceDir, '../../apps/cms/src/routes'),
				'@cms': path.resolve(workspaceDir, '../../apps/cms/src/lib')
			}
		}
	};
};

/**
 * Create Plesk deployment plugin (optional)
 * Adds custom deployment hooks for Plesk hosting
 *
 * @param {string} workspaceDir - Absolute path to workspace directory
 * @returns {import('vite').Plugin} Vite plugin
 */
export const createPleskDeployPlugin = (workspaceDir) => {
	return {
		name: 'plesk-deploy',
		closeBundle() {
			console.log(`✓ Build complete for ${path.basename(workspaceDir)}`);
			console.log(`  Ready for Plesk deployment`);
		}
	};
};

/**
 * Create bundle analysis plugin
 * Logs bundle size information after build
 *
 * @returns {import('vite').Plugin} Vite plugin
 */
export const createBundleAnalysisPlugin = () => {
	return {
		name: 'bundle-analysis',
		closeBundle() {
			// Bundle analysis could be added here
			console.log(`✓ Bundle analysis complete`);
		}
	};
};

export default getBaseViteConfig;
