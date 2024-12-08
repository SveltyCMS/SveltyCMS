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
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';

import { purgeCss } from 'vite-plugin-tailwind-purgecss';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { paraglide } from '@inlang/paraglide-sveltekit/vite';
// Gets package.json version info on app start
// https://kit.svelte.dev/faq#read-package-jsonimport { readFileSync } from 'fs'
import { fileURLToPath } from 'url';
import { compile } from './src/routes/api/compile/compile';
import { generateCollectionTypes } from './src/collections/vite';

// Get package.json version info
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// Get current file and directory info
const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);
const parsed = Path.parse(__dirname);

// Define paths for collections
const compiledCollections = Path.posix.join('/', __dirname.replace(parsed.root, ''), 'collections/');
const userCollections = Path.posix.join('/', __dirname.replace(parsed.root, ''), 'config/collections/');

// Define config directory paths
const configDir = resolve(__dirname, 'config');
const privateConfigPath = resolve(configDir, 'private.ts');
const publicConfigPath = resolve(configDir, 'public.ts');

// Check config files
const configPaths = [privateConfigPath, publicConfigPath];

configPaths.forEach((path) => {
	if (!existsSync(path)) {
		console.error('Config files missing: Please run the CLI installer via `npm run installer`.');
		try {
			execSync('npm run installer', { stdio: 'inherit' });
			console.log('Installer completed successfully.');
		} catch (error) {
			console.error('Error running the installer:', error);
			process.exit(1);
		}
	}
});

// Initial compilation of collections
await compile({
	userCollections,
	compiledCollections
});

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'collection-handler',
			configureServer(server) {
				return () => {
					server.watcher.on('change', async (file) => {
						// Monitor all collection-related changes
						if (file.includes('/collections/') && file.endsWith('.ts')) {
							try {
								await generateCollectionTypes(server);
								console.log('Collection types updated successfully');
							} catch (error) {
								console.error('Error updating collection types:', error);
							}
						}
					});
				};
			},
			async handleHotUpdate({ file, server }) {
				// Monitor changes in:
				// 1. config/collections/**/*.ts - User-defined collection configurations (including nested)
				// 2. src/collections/categories.ts - Auto-generated category structure
				if (/config[/\\]collections[/\\].*[/\\].*\.ts$/.test(file) || /src[/\\]collections[/\\]categories\.ts$/.test(file)) {
					console.log('Collection file changed:', file);
					try {
						// Compile the changed collection
						await compile({
							userCollections,
							compiledCollections
						});

						// Notify client to reload collections
						server.ws.send({
							type: 'custom',
							event: 'collections-updated',
							data: { file }
						});

						// Trigger HMR for affected modules
						return [];
					} catch (error) {
						console.error('Error processing collection change:', error);
						return [];
					}
				}

				// Handle category file changes
				if (/src[/\\]collections[/\\]categories\.ts$/.test(file)) {
					console.log('Categories file changed:', file);
					server.ws.send({
						type: 'custom',
						event: 'categories-updated',
						data: { file }
					});
					return [];
				}

				// Handle config file changes
				if (/config[/\\]roles\.ts$/.test(file)) {
					console.log('Roles file changed:', file);
					try {
						// Clear module cache to force re-import
						const rolesPath = `file://${Path.resolve(__dirname, 'config', 'roles.ts')}`;
						// Dynamically reimport updated roles & permissions
						const { roles } = await import(rolesPath + `?update=${Date.now()}`);
						// Update roles and permissions in the application
						const { setLoadedRoles } = await import('./src/auth/types');
						setLoadedRoles(roles);

						console.log('Roles reloaded');
						// Trigger HMR for affected modules
						server.ws.send({ type: 'full-reload' });
					} catch (error) {
						console.error('Error reloading roles:', error);
					}
					return [];
				}
			},
			config() {
				return {
					define: {
						'import.meta.env.root': JSON.stringify(Path.posix.join('/', __dirname.replace(parsed.root, ''))),
						'import.meta.env.userCollectionsPath': JSON.stringify(userCollections),
						'import.meta.env.compiledCollectionsPath': JSON.stringify(compiledCollections)
					}
				};
			},
			enforce: 'post'
		},
		purgeCss(), // Purge unused Tailwind CSS classes
		paraglide({
			project: './project.inlang', // Path to your inlang project
			outdir: './src/paraglide' // Output directory for generated files
		})
	],
	server: {
		fs: { allow: ['static', '.'] } // Allow serving files from specific directories
	},

	resolve: {
		alias: {
			'@root': resolve(__dirname, './'),
			'@src': resolve(__dirname, './src'),
			'@components': resolve(__dirname, './src/components'),
			'@collections': resolve(__dirname, './src/collections'),
			'@utils': resolve(__dirname, './src/utils'),
			'@stores': resolve(__dirname, './src/stores')
		}
	},
	define: {
		__VERSION__: JSON.stringify(pkg.version), // Define global version variable from package.json
		SUPERFORMS_LEGACY: true // Legacy flag for SuperForms (if needed)
	}
});
