/**
 * @file vite.config.ts
 * @description This configuration file defines the Vite setup for a SvelteKit project,
 * including custom plugins for dynamic collection handling, Tailwind CSS purging,
 * and Paraglide integration. It also initializes compilation tasks and sets up
 * environment variables and alias paths for the project.
 *
 * @dependencies
 * - Path: Node.js module for handling and transforming file paths.
 * - fs: Node.js file system module used to read the package.json file.
 * - resolve: Vite utility to resolve file paths.
 * - sveltekit: Plugin for integrating Vite with SvelteKit.
 * - purgeCss: Plugin to purge unused Tailwind CSS classes from the final build.
 * - paraglide: Plugin for integrating the Inlang localization framework.
 * - compile, generateCollectionTypes, generateCollectionFieldTypes:
 *   Custom utilities to handle dynamic compilation and type generation for collections.
 *
 * @function compile
 * @description Initializes the compilation of collections using specified folder paths
 * for JavaScript and TypeScript collections. This is executed at the start to ensure
 * collections are up-to-date.
 *
 * @object export default
 * @description Exports the Vite configuration object, including:
 * - Plugins:
 *   - sveltekit: Integrates SvelteKit with Vite.
 *   - vite:dynamic-collection-updater: Custom plugin to watch and recompile collections on file changes.
 *   - purgeCss: Purges unused CSS from the final build using Tailwind's purging mechanism.
 *   - paraglide: Integrates the Inlang localization project into the SvelteKit app.
 * - Server:
 *   - fs: Allows serving files from the specified directories.
 * - Resolve:
 *   - alias: Sets up path aliases for easier module resolution.
 * - Define:
 *   - __VERSION__: Defines the app version from the package.json file.
 *   - SUPERFORMS_LEGACY: Enables legacy mode for Superforms.
 */

import Path from 'path';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { purgeCss } from 'vite-plugin-tailwind-purgecss';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { paraglide } from '@inlang/paraglide-vite';

// Gets package.json version info on app start
// https://kit.svelte.dev/faq#read-package-jsonimport { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { compile } from './src/routes/api/compile/compile';
import { generateCollectionFieldTypes, generateCollectionTypes } from './src/utils/collectionTypes';

// Gets package.json version info on app start
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// Get current file and directory info
const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);
const parsed = Path.parse(__dirname);

// Define paths for collections
const collectionsFolderJS = '/' + __dirname.replace(parsed.root, '').replaceAll('\\', '/') + '/collections/';
const collectionsFolderTS = '/' + __dirname.replace(parsed.root, '').replaceAll('\\', '/') + '/src/collections/';

// Initial compilation of collections
compile({ collectionsFolderJS, collectionsFolderTS });

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'vite:dynamic-collection-updater',
			transform(code, id) {
				if (id.endsWith('.svelte')) {
					return {};
				}
			},
			configureServer(server) {
				const handleFileChange = async (path: string) => {
					if (/src[/\\]collections/.test(path)) {
						await compile({ collectionsFolderJS, collectionsFolderTS });
						generateCollectionTypes();
						generateCollectionFieldTypes();
					}
					if (/config[/\\]permissions\.ts/.test(path)) {
						// Invalidate the module cache for permissions.ts
						const permissionsPath = resolve(__dirname, 'config', 'permissions.ts');
						delete require.cache[require.resolve(permissionsPath)];

						// Reload the roles and permissions
						const { roles, permissions } = await import('./config/permissions');

						// Update the loaded roles and permissions in auth/types.ts
						const { setLoadedRoles, setLoadedPermissions } = await import('./src/auth/types');
						setLoadedRoles(roles);
						setLoadedPermissions(permissions);

						console.log('Roles and permissions reloaded from config');
					}
				};

				const handleFieldTypeChange = (path: string) => {
					if (/src[/\\]collections/.test(path) && !path.includes('types.ts')) {
						generateCollectionFieldTypes();
					}
				};

				// Register file watchers for dynamic updates
				server.watcher.on('add', handleFileChange);
				server.watcher.on('unlink', handleFileChange);
				server.watcher.on('change', handleFieldTypeChange);
			},

			// Add Collections & environment variables
			config() {
				return {
					define: {
						'import.meta.env.collectionsFolderJS': JSON.stringify(collectionsFolderJS),
						'import.meta.env.collectionsFolderTS': JSON.stringify(collectionsFolderTS),
						'import.meta.env.root': JSON.stringify('/' + __dirname.replace(parsed.root, '').replaceAll('\\', '/'))
					}
				};
			},
			enforce: 'post'
		},
		purgeCss(),
		paraglide({
			project: './project.inlang', // Path to your inlang project
			outdir: './src/paraglide' // Output directory for generated files
		})
	],
	server: {
		fs: { allow: ['static', '.'] }
	},
	resolve: {
		alias: {
			'@src': resolve(__dirname, './src')
		}
	},
	define: {
		__VERSION__: JSON.stringify(pkg.version),
		SUPERFORMS_LEGACY: true
		// },
		// logLevel: 'error', // Change log level to 'info'
		// build: {
		// 	minify: false, // Disable minification to make the build output more readable
		// 	sourcemap: true // Enable source maps to get better error stack traces
	}
});
