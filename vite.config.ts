/**
 * @file vite.config.ts
 * @description This configuration file defines the Vite setup for a SvelteKit project.
 * It includes checks for required configuration files (private.ts and public.ts),
 * a custom plugin for dynamic collection handling (compilation, type generation, hot reloading),
 * dynamic role and permission handling with hot reloading, Tailwind CSS purging,
 * and Paraglide integration for internationalization. The configuration also initializes
 * compilation tasks, sets up environment variables, and defines alias paths for the project.
 */

import Path from 'path';
import { resolve } from 'path';
import { readFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { purgeCss } from 'vite-plugin-tailwind-purgecss';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import svelteEmailTailwind from 'svelte-email-tailwind/vite';
import { compile } from './src/routes/api/compile/compile';
import { generateContentTypes } from './src/content/vite';
import type { IncomingMessage, ServerResponse } from 'http';

// Get package.json version info
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

// Config directories
const userCollections = Path.posix.join(process.cwd(), 'config/collections');
const compiledCollections = Path.posix.join(process.cwd(), 'compiledCollections');
const configDir = resolve(process.cwd(), 'config');
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

let compileTimeout: NodeJS.Timeout;

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'collection-watcher',
			async buildStart() {
				try {
					await compile({ userCollections, compiledCollections });
					console.log('\x1b[32mInitial compilation successful!\x1b[0m\n ');
				} catch (error) {
					console.error('\x1b[31mInitial compilation failed:\x1b[0m', error);
					throw error;
				}
			},
			configureServer(server) {
				let lastUnlinkFile: string | null = null;
				let lastUnlinkTime = 0;
				// const lastUUIDUpdate: { [key: string]: number } = {}; // Remove unused variable

				return () => {
					server.watcher.on('all', async (event, file) => {
						// Monitor changes in config/collections/**/*.ts and **/*.js
						if (file.startsWith(userCollections) && (file.endsWith('.ts') || file.endsWith('.js'))) {
							console.log(`Collection file event: \x1b[33m${event}\x1b[0m - \x1b[34m${file}\x1b[0m`);

							clearTimeout(compileTimeout);
							// Debounce all events (add, change, unlink, unlinkDir) to trigger a single compile run
							compileTimeout = setTimeout(async () => {
								try {
									const currentTime = Date.now(); // Get current time inside the debounced function

									// Log the specific event that triggered this compile run
									// Note: Multiple events might occur within the debounce period.
									// We primarily care that *something* changed.
									console.log(`Processing collection change event: \x1b[33m${event}\x1b[0m for \x1b[34m${file}\x1b[0m`);

									// Rename detection logic (optional, compile handles moves/renames now)
									// We can keep this logging for clarity if desired.
									if (event === 'unlink' || event === 'unlinkDir') {
										lastUnlinkFile = file;
										lastUnlinkTime = currentTime;
										// console.log(`File marked for potential rename/deletion: \x1b[31m${file}\x1b[0m`); // Removed verbose log
									} else if (event === 'add') {
										const isRename = lastUnlinkFile && currentTime - lastUnlinkTime < 100; // Keep rename detection window small
										if (isRename) {
											console.log(`Detected potential rename: \x1b[33m${lastUnlinkFile}\x1b[0m -> \x1b[32m${file}\x1b[0m`);
											lastUnlinkFile = null; // Reset rename detection
										}
									}

									// --- Always run compile, which now handles cleanup internally ---
									await compile({ userCollections, compiledCollections });
									console.log('\x1b[32mCompilation and cleanup successful!\x1b[0m\n');

									// --- Post-compilation steps (only needed if compile succeeded) ---

									// Generate types if add/change event occurred (unlink doesn't need type update)
									if (event === 'add' || event === 'change') {
										try {
											await generateContentTypes(server);
											console.log(`Collection types updated potentially due to: \x1b[32m${file}\x1b[0m`);
										} catch (error) {
											console.error('Error updating collection types:', error);
										}
									}

									// Trigger content-structure sync via API (if needed for any change)
									// Consider if this is needed for 'unlink' as well. Assuming yes for now.
									{
										// Scope variables for sync
										const maxRetries = 3;
										let retryCount = 0;
										const syncContentStructure = async () => {
											try {
												// Create a proper Node.js request object (keep as is)
												const req = {
													method: 'POST',
													url: '/api/content-structure', // Ensure this endpoint exists and handles POST
													originalUrl: '/api/content-structure',
													headers: {
														'content-type': 'application/json'
													},
													body: JSON.stringify({
														// Ensure body matches endpoint expectation
														action: 'recompile' // Or perhaps pass specific file/event info?
													}),
													on: (event, callback) => {
														// Simplified mock event handling
														if (event === 'data') callback(Buffer.from(req.body || ''));
														if (event === 'end') callback();
													}
												};

												// Create a proper Node.js response object (keep as is)
												const res = {
													writeHead: () => { },
													setHeader: () => { },
													getHeader: () => { },
													write: () => { },
													end: () => { },
													statusCode: 200
												};

												// Use the server's middleware to handle the request (keep as is)
												// Attempt to cast to expected types, though exact match might be difficult
												await new Promise<void>((resolveMiddleware) => {
													server.middlewares(req as IncomingMessage, res as ServerResponse, () => resolveMiddleware());
												});

												console.log('Content structure sync triggered successfully');
											} catch (syncError) {
												if (retryCount < maxRetries) {
													retryCount++;
													console.log(`Retrying content structure sync (attempt ${retryCount})...`);
													await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
													await syncContentStructure(); // Await the recursive call
												} else {
													console.error('Failed to trigger content structure sync after retries:', syncError);
												}
											}
										};
										await syncContentStructure();
									} // End scope for sync

									// Notify client to reload collections (always do this after compile)
									server.ws.send({
										type: 'custom', // Ensure client listens for this
										event: 'collections-updated',
										data: {}
									});
								} catch (error) {
									console.error(`Error processing collection file ${event}:`, error);
								}
							}, 50);
						}

						// Handle config file changes
						if (file.startsWith(Path.posix.join(process.cwd(), 'config/roles.ts'))) {
							console.log(`Roles file changed: \x1b[34m${file}\x1b[0m`);

							try {
								// Clear module cache to force re-import
								const rolesPath = `file://${Path.posix.resolve(process.cwd(), 'config', 'roles.ts')}`;
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
					});
				};
			},
			config() {
				return {
					define: {
						'import.meta.env.root': JSON.stringify(Path.posix.join('/', process.cwd().replace(Path.parse(process.cwd()).root, ''))),
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
		}),
		svelteEmailTailwind({
			pathToEmailFolder: './src/components/emails' // defaults to '/src/lib/emails'
		})
	],

	server: {
		fs: { allow: ['static', '.'] } // Allow serving files from specific directories
	},
	resolve: {
		alias: {
			'@root': resolve(process.cwd(), './'),
			'@src': resolve(process.cwd(), './src'),
			'@components': resolve(process.cwd(), './src/components'),
			'@content': resolve(process.cwd(), './src/content'),
			'@utils': resolve(process.cwd(), './src/utils'),
			'@stores': resolve(process.cwd(), './src/stores'),
			'@widgets': resolve(process.cwd(), './src/widgets')
		}
	},
	define: {
		__VERSION__: JSON.stringify(pkg.version), // Define global version variable from package.json
		SUPERFORMS_LEGACY: true // Legacy flag for SuperForms (if needed)
	}
});
