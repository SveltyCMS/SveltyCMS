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
import { readFileSync, existsSync, rmSync } from 'fs';
import { execSync } from 'child_process';
import { purgeCss } from 'vite-plugin-tailwind-purgecss';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { paraglide } from '@inlang/paraglide-sveltekit/vite';
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
await compile({ userCollections, compiledCollections });

// Function to clean up orphaned files (supports nested structures)
async function cleanupOrphanedFiles(userCollections: string, compiledCollections: string) {
	const files = await import('fs/promises').then((fs) => fs.readdir(compiledCollections, { withFileTypes: true }));

	for (const file of files) {
		const filePath = Path.posix.join(compiledCollections, file.name);
		if (file.isDirectory()) {
			// Recursively clean up subdirectories
			await cleanupOrphanedFiles(
				Path.posix.join(userCollections, file.name),
				filePath
			);
			// Remove the directory if it's now empty
			const remainingFiles = await import('fs/promises').then((fs) => fs.readdir(filePath));
			if (remainingFiles.length === 0) {
				rmSync(filePath, { recursive: true, force: true });
				console.log(`Removed empty directory: ${filePath}`);
			}
		} else if (file.isFile() && file.name.endsWith('.js')) {
			// Check against corresponding .ts file in userCollections
			const userFilePath = Path.posix.join(userCollections, file.name.replace(/\.js$/, '.ts'));
			if (!existsSync(userFilePath)) {
				rmSync(filePath, { force: true });
				console.log(`Removed orphaned file: ${filePath}`);
			}
		}
	}
}

let compileTimeout: NodeJS.Timeout;

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'collection-handler',
			configureServer(server) {
				return () => {
					server.watcher.on('change', async (file) => {
						// Monitor all collection-related changes
						if (file.startsWith(userCollections) && file.endsWith('.ts')) {
							try {
								await generateCollectionTypes(server);
							} catch (error) {
								console.error('Error updating collection types:', error);
							}
						}
					});
				};
			},
			async handleHotUpdate({ file, server }) {

				// Monitor changes in config/collections/**/*.ts
				if (file.startsWith(userCollections)) {
					console.log(`Collection file changed: \x1b[34m${file}\x1b[0m`);
					try {
						// Check if the file still exists
						const fileExists = existsSync(file);

						// Debounce compile calls
						clearTimeout(compileTimeout);
						compileTimeout = setTimeout(async () => {
							if (!fileExists) {
								console.log(`Collection file deleted: \x1b[31m${file}\x1b[0m`);
								// Handle deletion: Trigger cleanup for deleted files
								// Pass the directory containing the deleted file to cleanupOrphanedFiles
								await cleanupOrphanedFiles(userCollections, compiledCollections);
								console.log(`Cleanup completed for deleted file: \x1b[31m${file}\x1b[0m`);
							} else {
								// Handle modification: Recompile
								await compile({ userCollections, compiledCollections });
								console.log(`Recompilation triggered for: \x1b[34m${file}\x1b[0m`);
							}

							// Notify client to reload collections
							server.ws.send({
								type: 'custom',
								event: 'collections-updated',
								data: {}
							});
						}, 300);
					} catch (error) {
						console.error('Error processing collection change:', error);
					}
					return []; // Prevent default HMR behavior
				}

				// Handle category file changes
				if (file.startsWith(Path.posix.join(__dirname, 'src/collections/categories.ts'))) {
					console.log(`Categories file changed \x1b[34m${file}\x1b[0m`);
					server.ws.send({
						type: 'custom',
						event: 'categories-updated',
						data: {}
					});
					return []; // Prevent default HMR behavior
				}

				// Handle config file changes
				if (file.startsWith(Path.posix.join(configDir, 'roles.ts'))) {
					console.log(`Roles file changed: \x1b[34m${file}\x1b[0m`);

					try {
						// Clear module cache to force re-import
						const rolesPath = `file://${Path.resolve(__dirname, 'config', 'roles.ts')}`;
						// Dynamically reimport updated roles & permissions
						const { roles } = await import(rolesPath + `?update=${Date.now()}`);
						// Update roles and permissions in the application
						const { setLoadedRoles } = await import('./src/auth/types');
						setLoadedRoles(roles);

						// Trigger full page reload
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