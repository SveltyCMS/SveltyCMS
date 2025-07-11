/**
 * @file vite.config.ts
 * @description This configuration file defines the Vite setup for a SvelteKit project.
 * It includes checks & validation for required configuration files (private.ts and public.ts),
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
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import svelteEmailTailwind from 'svelte-email-tailwind/vite';
import { compile } from './src/routes/api/compile/compile';
import { generateContentTypes } from './src/content/vite';
import type { IncomingMessage, ServerResponse } from 'http';
import { builtinModules } from 'module';

// Validation
import { publicConfigSchema, privateConfigSchema, validateConfig } from './config/types';

export default defineConfig(async () => {
	// Config file paths
	const configDir = resolve(process.cwd(), 'config');
	const privateConfigPath = resolve(configDir, 'private.ts');
	const publicConfigPath = resolve(configDir, 'public.ts');
	const configPaths = [
		{ path: privateConfigPath, name: 'config/private.ts' },
		{ path: publicConfigPath, name: 'config/public.ts' }
	];

	// Check if config files exist
	const missingConfigs = configPaths.filter((config) => !existsSync(config.path));
	if (missingConfigs.length > 0) {
		console.error('\n❌ Configuration files missing:');
		missingConfigs.forEach((config) => {
			console.error(`  - ${config.name}`);
		});
		console.error('\n💡 Running installer to generate missing configuration files...');
		try {
			execSync('bun run installer', { stdio: 'inherit' });

			// Immediately check if config files were actually created
			const stillMissingAfterInstall = configPaths.filter((config) => !existsSync(config.path));
			if (stillMissingAfterInstall.length > 0) {
				console.error('\n❌ Configuration files were not created by the installer:');
				stillMissingAfterInstall.forEach((config) => {
					console.error(`  - ${config.name}`);
				});
				console.error('\n💡 This usually happens when the installer is cancelled or fails.');
				console.error('Please run `bun run installer` manually to complete the setup.');
				console.error('👋 Exiting Vite configuration gracefully...');
				process.exit(0); // Exit gracefully instead of crashing
			}

			console.log('✅ Installer completed successfully.');
		} catch (e) {
			console.error('❌ Error running the installer:', e);
			console.error('Please run `bun run installer` manually to generate config files.');
			console.error('👋 Exiting Vite configuration gracefully...');
			process.exit(0); // Exit gracefully instead of crashing
		}
	}

	// Import configs only after ensuring they exist
	let actualPublicConfig, actualPrivateConfig;
	try {
		// Double-check that files still exist before importing
		if (!existsSync(privateConfigPath) || !existsSync(publicConfigPath)) {
			console.error('\n❌ Config files are missing after installer check.');
			console.error('This usually means the installer was cancelled or failed.');
			console.error('Please run `bun run installer` manually to complete the setup.');
			console.error('👋 Exiting Vite configuration gracefully...');
			process.exit(0); // Exit gracefully
		}

		// Use dynamic import to avoid cache issues
		const publicModule = await import('./config/public');
		const privateModule = await import('./config/private');
		actualPublicConfig = publicModule.publicEnv;
		actualPrivateConfig = privateModule.privateEnv;
	} catch (importError) {
		console.error('\n❌ Failed to import config files after installer.');
		console.error('This usually means the installer was cancelled or the files are malformed.');
		console.error('Please run `bun run installer` manually to recreate the config files.');
		console.error('👋 Exiting Vite configuration gracefully...');
		console.error('\nError details:', importError);
		process.exit(0); // Exit gracefully instead of crashing
	}

	// Validate configs
	try {
		validateConfig(publicConfigSchema, actualPublicConfig, 'Public Config (config/public.ts)');
		validateConfig(privateConfigSchema, actualPrivateConfig, 'Private Config (config/private.ts)');
	} catch (validationError) {
		console.error('\n❌ Config validation failed.');
		console.error(validationError);
		process.exit(1);
	}

	// If validation passes, start the app
	const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
	const userCollections = Path.posix.join(process.cwd(), 'config/collections');
	const compiledCollections = Path.posix.join(process.cwd(), 'compiledCollections');

	let compileTimeout: NodeJS.Timeout;
	// Helper function for non-blocking validation during development
	function tryValidateConfig(privateConfig: unknown, publicConfig: unknown): boolean {
		try {
			validateConfig(publicConfigSchema, publicConfig, 'Public Config');
			validateConfig(privateConfigSchema, privateConfig, 'Private Config');
			return true;
		} catch {
			return false;
		}
	}

	return {
		plugins: [
			sveltekit(),
			{
				name: 'collection-watcher',
				async buildStart() {
					try {
						await compile({ userCollections, compiledCollections });
						console.log('\x1b[32m✅ Initial compilation successful!\x1b[0m\n');
					} catch (error) {
						console.error('\x1b[31m❌ Initial compilation failed:\x1b[0m', error);
						throw error;
					}
				},
				configureServer(server) {
					let lastUnlinkFile: string | null = null;
					let lastUnlinkTime = 0;

					return () => {
						server.watcher.on('all', async (event, file) => {
							// Monitor changes in config/collections/**/*.ts and **/*.js
							if (file.startsWith(userCollections) && (file.endsWith('.ts') || file.endsWith('.js'))) {
								console.log(`📁 Collection file event: \x1b[33m${event}\x1b[0m - \x1b[34m${file}\x1b[0m`);

								clearTimeout(compileTimeout);
								compileTimeout = setTimeout(async () => {
									try {
										const currentTime = Date.now();
										console.log(`⚡ Processing collection change: \x1b[33m${event}\x1b[0m for \x1b[34m${file}\x1b[0m`);

										// Rename detection logic
										if (event === 'unlink' || event === 'unlinkDir') {
											lastUnlinkFile = file;
											lastUnlinkTime = currentTime;
										} else if (event === 'add') {
											const isRename = lastUnlinkFile && currentTime - lastUnlinkTime < 100;
											if (isRename) {
												console.log(`🔄 Detected rename: \x1b[33m${lastUnlinkFile}\x1b[0m -> \x1b[32m${file}\x1b[0m`);
												lastUnlinkFile = null;
											}
										}

										// Run compilation with cleanup
										await compile({ userCollections, compiledCollections });
										console.log('\x1b[32m✅ Compilation and cleanup successful!\x1b[0m\n');

										// Generate types for add/change events
										if (event === 'add' || event === 'change') {
											try {
												await generateContentTypes(server);
												console.log(`📝 Collection types updated for: \x1b[32m${file}\x1b[0m`);
											} catch (error) {
												console.error('❌ Error updating collection types:', error);
											}
										}

										// Trigger content-structure sync
										{
											const maxRetries = 3;
											let retryCount = 0;
											const syncContentStructure = async () => {
												try {
													// Mock request
													const req = {
														method: 'POST',
														url: '/api/content-structure',
														originalUrl: '/api/content-structure',
														headers: { 'content-type': 'application/json' },
														body: JSON.stringify({ action: 'recompile' }),
														on: (event, callback) => {
															if (event === 'data') callback(Buffer.from(req.body || ''));
															if (event === 'end') callback();
														}
													};

													// Mock response
													const res = {
														writeHead: () => {},
														setHeader: () => {},
														getHeader: () => {},
														write: () => {},
														end: () => {},
														statusCode: 200
													};

													await new Promise<void>((resolveMiddleware) => {
														server.middlewares(req as IncomingMessage, res as ServerResponse, () => resolveMiddleware());
													});

													console.log('🔄 Content structure sync triggered successfully');
												} catch (syncError) {
													if (retryCount < maxRetries) {
														retryCount++;
														console.log(`🔄 Retrying content structure sync (attempt ${retryCount})...`);
														await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
														await syncContentStructure();
													} else {
														console.error('❌ Failed to trigger content structure sync after retries:', syncError);
													}
												}
											};
											await syncContentStructure();
										}

										// Notify client to reload collections
										server.ws.send({
											type: 'custom',
											event: 'collections-updated',
											data: {}
										});
									} catch (error) {
										console.error(`❌ Error processing collection file ${event}:`, error);
									}
								}, 50);
							}

							// Handle config file changes with re-validation
							if (file.includes('config/private.ts') || file.includes('config/public.ts')) {
								console.log(`⚙️  Config file changed: \x1b[34m${file}\x1b[0m`);
								console.log('🔍 Re-validating configuration...');

								try {
									// Clear module cache and re-import configs
									delete require.cache[require.resolve('./config/private')];
									delete require.cache[require.resolve('./config/public')];

									const { privateEnv: newPrivateConfig } = await import('./config/private');
									const { publicEnv: newPublicConfig } = await import('./config/public');

									// Re-validate configurations
									const validationPassed = tryValidateConfig(newPrivateConfig, newPublicConfig);

									if (!validationPassed) {
										console.error('❌ Configuration validation failed after changes.');
										console.error('Please fix the errors and save the file again.');
									} else {
										console.log('✅ Configuration re-validated successfully!');
										// Trigger full page reload for config changes
										server.ws.send({ type: 'full-reload' });
									}
								} catch (error) {
									console.error('❌ Error re-validating configuration:', error);
								}
							}

							// Handle roles file changes
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
									console.log('Roles updated successfully');
								} catch (error) {
									console.error('Error reloading roles:', error);
								}
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
			paraglideVitePlugin({
				project: './project.inlang', // Path to your inlang project settings
				outdir: './src/paraglide', // This is where you specify the output directory
				strategy: ['cookie', 'baseLocale'] // Changed to use cookie-based routing
			}),
			svelteEmailTailwind({
				pathToEmailFolder: './src/components/emails' // defaults to '/src/lib/emails'
			})
		],

		// Build configuration to support top-level await and modern JavaScript features
		build: {
			target: 'esnext', // Support latest JavaScript features including top-level await
			minify: 'esbuild',
			sourcemap: true,
			rollupOptions: {
				external: [
					...builtinModules,
					...builtinModules.map((m) => `node:${m}`),
					'typescript',
					// Additional modules that should not be bundled
					'ts-node',
					'ts-loader',
					'@typescript-eslint/parser',
					'@typescript-eslint/eslint-plugin'
				]
				// The conflicting `output.manualChunks` option has been removed.
			}
		},

		// ESBuild configuration to ensure consistency
		esbuild: {
			target: 'esnext',
			supported: {
				'top-level-await': true
			}
		},

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
			SUPERFORMS_LEGACY: true, // Legacy flag for SuperForms (if needed)
			// ES Module polyfills for Node.js globals
			global: 'globalThis'
		},
		optimizeDeps: {
			exclude: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)]
		}
	};
});

