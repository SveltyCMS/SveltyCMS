/**
 * @file vite.config.ts
 * @description This configuration file defines the Vite setup for a SvelteKit project,
 * including custom plugins for dynamic role and permission handling, collection handling,
 * Tailwind CSS purging, and Paraglide integration. It also initializes compilation tasks
 * and sets up environment variables and alias paths for the project.
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
 */

import Path from 'path';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { purgeCss } from 'vite-plugin-tailwind-purgecss';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { paraglide } from '@inlang/paraglide-vite';
// Gets package.json version info on app start
// https://kit.svelte.dev/faq#read-package-jsonimport { readFileSync } from 'fs'
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
			name: 'vite:dynamic-config-updater',
			async handleHotUpdate({ file, server }) {
				if (/config[/\\](permissions|roles)\.ts$/.test(file)) {
					// Clear module cache
					const permissionsPath = resolve(__dirname, 'config', 'permissions.ts');
					const rolesPath = resolve(__dirname, 'config', 'roles.ts');

					delete require.cache[require.resolve(permissionsPath)];
					delete require.cache[require.resolve(rolesPath)];

					// Dynamically reimport updated roles & permissions
					const { roles } = await import('./config/roles');
					const { permissions } = await import('./config/permissions');

					// Update roles and permissions in the application
					const { setLoadedRoles, setLoadedPermissions } = await import('./src/auth/types');
					setLoadedRoles(roles);
					setLoadedPermissions(permissions);

					console.log('Roles and permissions reloaded from config');

					// Trigger HMR for affected modules
					// server.ws.send({ type: 'full-reload' });
				} else if (/src[/\\]collections/.test(file)) {
					if (/src[/\\]collections/.test(file)) {
						// Recompile collections and update types
						await compile({ collectionsFolderJS, collectionsFolderTS });
						generateCollectionTypes();
						generateCollectionFieldTypes();
					}
				}
			},
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
		fs: { allow: ['static', '.'] },
		watch: {
			ignored: /config[/\\](permissions|roles)\.ts$/
		}
	},
	resolve: {
		alias: {
			'@src': resolve(__dirname, './src'),
			'@root': resolve(__dirname, './')
		}
	},
	define: {
		__VERSION__: JSON.stringify(pkg.version),
		SUPERFORMS_LEGACY: true
	}
});
