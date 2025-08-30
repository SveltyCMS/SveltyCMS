/**
 * @file vite.config.ts
 * @description This configuration file defines the Vite setup for a SvelteKit project.
 * It includes checks & validation for required configuration files (private.ts and public.ts),
 * a custom plugin for dynamic collection handling (compilation, type generation, hot reloading),
 * dynamic role and permission handling with hot reloading, Tailwind CSS purging
 * and Paraglide integration for internationalization. The configuration also initializes
 * compilation tasks, sets up environment variables, and defines alias paths for the project
 */

import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { existsSync, readFileSync } from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import { builtinModules } from 'module';
import Path, { resolve } from 'path';
import svelteEmailTailwind from 'svelte-email-tailwind/vite';
import { defineConfig } from 'vite';
import { purgeCss } from 'vite-plugin-tailwind-purgecss';
import { generateContentTypes } from './src/content/vite';
import { compile } from './src/utils/compilation/compile';

// Function to generate private config content
function generatePrivateConfigContent(): string {
	return `/**
 * @file config/private.ts
 * @description Private configuration file - will be populated during setup
 */

import { createPrivateConfig } from './types';

export const privateEnv = createPrivateConfig({
	// Database Configuration
	DB_TYPE: 'mongodb',
	DB_HOST: '',
	DB_PORT: 27017,
	DB_NAME: '',
	DB_USER: '',
	DB_PASSWORD: '',

	// Security Keys
	JWT_SECRET_KEY: '',
	ENCRYPTION_KEY: '',

	// Multi-tenancy
	MULTI_TENANT: false,

	// If you have any essential static private config, add here. Otherwise, leave empty.
});
`;
}

export default defineConfig(async () => {
	const pkg = JSON.parse(readFileSync('package.json', 'utf8'));

	const useColor = process.stdout.isTTY && process.env.TERM && process.env.TERM !== 'dumb';
	const LOG_PREFIX = useColor ? '\x1b[36m[SETUP]\x1b[0m' : '[SETUP]';

	const privateConfigPath = Path.posix.join(process.cwd(), 'config/private.ts');

	if (!existsSync(privateConfigPath)) {
		console.log(`${LOG_PREFIX} Setup not complete – launching lightweight dev server for wizard...`);

		// Create private config file if it doesn't exist
		const fs = await import('fs/promises');
		const configDir = Path.posix.join(process.cwd(), 'config');
		if (!existsSync(configDir)) await fs.mkdir(configDir, { recursive: true });
		try {
			const configContent = generatePrivateConfigContent();
			await fs.writeFile(privateConfigPath, configContent);
			console.log(`${LOG_PREFIX} Created initial private config -> config/private.ts`);
		} catch (e) {
			console.error(`${LOG_PREFIX} Failed to provision private config:`, e);
		}

		return {
			plugins: [
				sveltekit(),
				{
					name: 'setup-wizard-opener',
					configureServer(server) {
						// Open setup wizard after server starts with correct port
						const originalListen = server.listen;
						server.listen = function (...args) {
							const result = originalListen.apply(this, args);

							// Get the actual port after server starts
							setTimeout(async () => {
								const address = server.httpServer?.address();
								const port = typeof address === 'object' && address ? address.port : 5173;
								const setupUrl = `http://localhost:${port}/setup`;

								try {
									const open = (await import('open')).default;
									console.log(`${LOG_PREFIX} Opening setup wizard in default browser...`);
									await open(setupUrl);
								} catch {
									const coloredSetupUrl = useColor ? `\x1b[34m${setupUrl}\x1b[0m` : setupUrl;
									console.log(`${LOG_PREFIX} Manual navigation required: ${coloredSetupUrl}`);
								}
							}, 1500);

							return result;
						};
					}
				}
			],
			server: { fs: { allow: ['static', '.'] } },
			define: {
				__VERSION__: JSON.stringify(pkg.version),
				SUPERFORMS_LEGACY: true,
				global: 'globalThis'
			}
		};
	}

	console.log(`${LOG_PREFIX} Setup complete – proceeding with full development environment initialization.\n`);

	const userCollections = Path.posix.join(process.cwd(), 'config/collections');
	const compiledCollections = Path.posix.join(process.cwd(), 'compiledCollections');

	let compileTimeout: NodeJS.Timeout;

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
							if (file.startsWith(userCollections) && (file.endsWith('.ts') || file.endsWith('.js'))) {
								console.log(`📁 Collection file event: \x1b[33m${event}\x1b[0m - \x1b[34m${file}\x1b[0m`);

								clearTimeout(compileTimeout);
								compileTimeout = setTimeout(async () => {
									try {
										const currentTime = Date.now();
										console.log(`⚡ Processing collection change: \x1b[33m${event}\x1b[0m for \x1b[34m${file}\x1b[0m`);

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

										await compile({ userCollections, compiledCollections });
										console.log('\x1b[32m✅ Compilation and cleanup successful!\x1b[0m\n');

										if (event === 'add' || event === 'change') {
											try {
												await generateContentTypes(server);
												console.log(`📝 Collection types updated for: \x1b[32m${file}\x1b[0m`);
											} catch (error) {
												console.error('❌ Error updating collection types:', error);
											}
										}

										// Mock POST to /api/content-structure to trigger sync
										{
											const maxRetries = 3;
											let retryCount = 0;
											const syncContentStructure = async () => {
												try {
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

										// (Removed WS event 'collections-updated' - no active listeners)
									} catch (error) {
										console.error(`❌ Error processing collection file ${event}:`, error);
									}
								}, 50);
							}

							if (file.startsWith(Path.posix.join(process.cwd(), 'config/roles.ts'))) {
								console.log(`Roles file changed: \x1b[34m${file}\x1b[0m`);

								try {
									const rolesPath = `file://${Path.posix.resolve(process.cwd(), 'config', 'roles.ts')}`;
									const { roles } = await import(rolesPath + `?update=${Date.now()}`);
									const { setLoadedRoles } = await import('./src/auth/types');
									setLoadedRoles(roles);
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
							'import.meta.env.userCollectionsPath': JSON.stringify(userCollections)
						}
					};
				},
				enforce: 'post'
			},
			purgeCss(),
			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/paraglide',
				strategy: ['cookie', 'baseLocale']
			}),
			svelteEmailTailwind({
				pathToEmailFolder: './src/components/emails'
			})
		],

		build: {
			target: 'esnext',
			minify: 'esbuild',
			sourcemap: true,
			rollupOptions: {
				onwarn(warning, warn) {
					// Suppress circular dependency warnings from third-party packages
					if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.message.includes('zod-to-json-schema')) {
						return;
					}
					// Suppress other non-critical warnings
					if (warning.code === 'UNUSED_EXTERNAL_IMPORT') {
						return;
					}
					warn(warning);
				},
				external: [
					...builtinModules,
					...builtinModules.map((m) => `node:${m}`),
					'typescript',
					'ts-node',
					'ts-loader',
					'@typescript-eslint/parser',
					'@typescript-eslint/eslint-plugin'
				],
				output: {
					manualChunks: (id) => {
						// Split large dependencies into separate chunks
						if (id.includes('node_modules')) {
							if (id.includes('@skeletonlabs/skeleton')) {
								return 'skeleton-ui';
							}
							if (id.includes('tiptap') || id.includes('@tiptap')) {
								return 'tiptap-editor';
							}
							if (id.includes('mongodb') || id.includes('mongoose')) {
								return 'database';
							}
							if (id.includes('lodash') || id.includes('date-fns')) {
								return 'utils';
							}
							// Group other node_modules into vendor chunk
							return 'vendor';
						}
					}
				}
			}
		},

		esbuild: {
			target: 'esnext',
			supported: {
				'top-level-await': true
			}
		},

		server: {
			fs: { allow: ['static', '.'] }
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
			__VERSION__: JSON.stringify(pkg.version),
			SUPERFORMS_LEGACY: true,
			global: 'globalThis'
		},
		optimizeDeps: {
			exclude: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
			include: ['svelte', '@sveltejs/kit', '@skeletonlabs/skeleton']
		}
	};
});
