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
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { paraglide } from '@inlang/paraglide-sveltekit/vite';
import { compile, cleanupOrphanedFiles } from './src/routes/api/compile/compile';
import { generateContentTypes } from './src/content/vite';
import tailwindcss from "@tailwindcss/vite";


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
		tailwindcss(),
		sveltekit(),
		{
			name: 'collection-watcher',
			async buildStart() {
				try {
					await compile({ userCollections, compiledCollections });
					console.log('Initial compilation successful!');
				} catch (error) {
					console.error('Initial compilation failed:', error);
					throw error;
				}
			},
			configureServer(server) {
				let lastUnlinkFile: string | null = null;
				let lastUnlinkTime = 0;
				const lastUUIDUpdate: { [key: string]: number } = {};

				return () => {
					server.watcher.on('all', async (event, file) => {
						// Monitor changes in config/collections/**/*.ts and **/*.js
						if (file.startsWith(userCollections) && (file.endsWith('.ts') || file.endsWith('.js'))) {
							console.log(`Collection file event: ${event} - \x1b[34m${file}\x1b[0m`);

							clearTimeout(compileTimeout);
							compileTimeout = setTimeout(async () => {
								try {
									const currentTime = Date.now();

									if (event === 'unlink' || event === 'unlinkDir') {
										lastUnlinkFile = file;
										lastUnlinkTime = currentTime;
										console.log(`Collection file deleted: \x1b[31m${file}\x1b[0m`);

										// Handle deletion
										await cleanupOrphanedFiles(userCollections, compiledCollections);
										console.log(`Cleanup completed for deleted file: \x1b[31m${file}\x1b[0m`);
									} else if (event === 'add' || event === 'change') {
										const isRename = lastUnlinkFile && currentTime - lastUnlinkTime < 100;

										if (isRename) {
											console.log(`Collection file renamed: \x1b[33m${lastUnlinkFile}\x1b[0m -> \x1b[32m${file}\x1b[0m`);
											lastUnlinkFile = null;
										} else {
											console.log(`Collection file ${event}: \x1b[32m${file}\x1b[0m`);
										}

										// Track update time
										lastUUIDUpdate[file] = currentTime;

										// Compile
										await compile({ userCollections, compiledCollections });
										console.log('Compilation successful!');

										// Trigger content-structure sync via API with retry logic
										const maxRetries = 3;
										let retryCount = 0;
										const syncContentStructure = async () => {
											try {
												// Create a proper Node.js request object
												const req = {
													method: 'POST',
													url: '/api/content-structure',
													originalUrl: '/api/content-structure',
													headers: {
														'content-type': 'application/json'
													},
													body: JSON.stringify({
														action: 'recompile'
													}),
													on: (event, callback) => {
														if (event === 'data') {
															callback(req.body);
														}
														if (event === 'end') {
															callback();
														}
													}
												};

												// Create a proper Node.js response object
												const res = {
													setHeader: () => { },
													getHeader: () => { },
													write: () => { },
													end: () => { },
													statusCode: 200
												};

												// Use the server's middleware to handle the request
												await new Promise((resolve) => {
													server.middlewares(req, res, () => resolve(undefined));
												});

												console.log('Content structure sync triggered successfully');
											} catch (error) {
												if (retryCount < maxRetries) {
													retryCount++;
													console.log(`Retrying content structure sync (attempt ${retryCount})...`);
													await new Promise((resolve) => setTimeout(resolve, 500));
													return syncContentStructure();
												}
												console.error('Failed to trigger content structure sync after retries:', error);
											}
										};

										await syncContentStructure();

										try {
											await generateContentTypes(server);
											console.log(`Collection types updated for: \x1b[32m${file}\x1b[0m`);
										} catch (error) {
											console.error('Error updating collection types:', error);
										}
									}

									// Notify client to reload collections
									server.ws.send({
										type: 'custom',
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
