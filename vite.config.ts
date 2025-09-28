/**
 * @file vite.config.ts
 * @description This configuration file defines the Vite setup for a SvelteKit project.
 * It uses a unified config structure that conditionally applies plugins for initial setup

 * It includes dynamic collection compilation, role/permission hot-reloading,
 * and Paraglide integration.
 */

import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { existsSync, promises as fs, readFileSync } from 'fs';
import type { IncomingMessage, ServerResponse } from 'http';
import { builtinModules } from 'module';
import path from 'path';
import svelteEmailTailwind from 'svelte-email-tailwind/vite';
import type { Plugin, UserConfig, ViteDevServer } from 'vite';
import { defineConfig } from 'vite';
import { generateContentTypes } from './src/content/vite';
import { compile } from './src/utils/compilation/compile';
import { isSetupComplete } from './src/utils/setupCheck';

// --- Constants ---
const LOG_PREFIX = process.stdout.isTTY ? '\x1b[36m[SVELTYCMS]\x1b[0m' : '[SVELTYCMS]';
const CWD = process.cwd();
const PKG = JSON.parse(readFileSync(path.resolve(CWD, 'package.json'), 'utf8'));

// --- Paths ---
const configDir = path.resolve(CWD, 'config');
const privateConfigPath = path.resolve(configDir, 'private.ts');
const userCollectionsPath = path.resolve(CWD, 'config/collections');
const compiledCollectionsPath = path.resolve(CWD, 'compiledCollections');

// Force exit on SIGINT to prevent hanging processes
process.on('SIGINT', () => {
	console.log(`\n${LOG_PREFIX} Received SIGINT, forcing exit...`);
	process.exit(0);
});

// --- Plugins ---

/**
 * A lightweight plugin to handle the initial setup wizard.
 * It creates a default private.ts and opens the setup page in the browser.
 */
function setupWizardPlugin(): Plugin {
	let serverInstance: ViteDevServer | null = null;
	const useColor = process.stdout.isTTY;
	let wasPrivateConfigMissing = false;
	let setupModeLogged = false; // Move flag inside plugin to prevent cross-instance issues
	let compileTimeout: NodeJS.Timeout;

	return {
		name: 'svelte-cms-setup-wizard',
		async buildStart() {
			if (!setupModeLogged) {
				console.log(`${LOG_PREFIX} Starting in setup mode...`);
				setupModeLogged = true;
			}
			console.log(`${LOG_PREFIX} Setup not complete. Preparing setup wizard...`);

			// Check if private config exists before creating it
			wasPrivateConfigMissing = !existsSync(privateConfigPath);

			// Ensure config directory and default private config exist.
			if (wasPrivateConfigMissing) {
				const content = `
/**
 * @file config/private.ts
 * @description Private configuration file containing essential bootstrap variables.
 * These values are required for the server to start and connect to the database.
 * This file will be populated during the initial setup process.
 */
import { createPrivateConfig } from './types';

export const privateEnv = createPrivateConfig({
    // --- Core Database Connection ---
    DB_TYPE: 'mongodb', // or 'mariadb', etc.
    DB_HOST: '',
    DB_PORT: 27017,
    DB_NAME: '',
    DB_USER: '',
    DB_PASSWORD: '',

    // --- Connection Behavior ---
    DB_RETRY_ATTEMPTS: 5,
    DB_RETRY_DELAY: 3000, // 3 seconds

    // --- Core Security Keys ---
    JWT_SECRET_KEY: '',
    ENCRYPTION_KEY: '',

    // --- Fundamental Architectural Mode ---
    MULTI_TENANT: false,

    /* * NOTE: All other settings (SMTP, Google OAuth, feature flags, etc.)
     * are loaded dynamically from the database after the application starts.
     */
});
`;
				try {
					await fs.mkdir(configDir, { recursive: true });
					await fs.writeFile(privateConfigPath, content);
					console.log(`${LOG_PREFIX} Created initial private config -> config/private.ts`);
				} catch (e) {
					console.error(`${LOG_PREFIX} Failed to provision private config:`, e);
				}
			}

			// Also ensure collection directories exist and perform initial compilation
			try {
				console.log(`${LOG_PREFIX} Ensuring collection directories exist...`);
				await fs.mkdir(userCollectionsPath, { recursive: true });
				await fs.mkdir(compiledCollectionsPath, { recursive: true });

				// Check if there are any collections to compile
				let sourceFiles: string[] = [];
				try {
					const files = await fs.readdir(userCollectionsPath, { recursive: true });
					sourceFiles = files.filter((file) => typeof file === 'string' && (file.endsWith('.ts') || file.endsWith('.js')));
				} catch {
					console.log(`${LOG_PREFIX} No collections found, creating empty structure`);
				}

				if (sourceFiles.length > 0) {
					console.log(`${LOG_PREFIX} Found ${sourceFiles.length} collection(s) in setup mode, compiling...`);
					await compile({ userCollections: userCollectionsPath, compiledCollections: compiledCollectionsPath });
					console.log('\x1b[32m✅ Collection compilation successful!\x1b[0m');
				} else {
					// Create empty structure to prevent errors
					await fs.mkdir(path.resolve(compiledCollectionsPath, 'Collections'), { recursive: true });
					await fs.mkdir(path.resolve(compiledCollectionsPath, 'Menu'), { recursive: true });
					const placeholderContent = '// Empty collection placeholder\nexport default {};';
					await fs.writeFile(path.resolve(compiledCollectionsPath, 'Collections', '.gitkeep.js'), placeholderContent);
					await fs.writeFile(path.resolve(compiledCollectionsPath, 'Menu', '.gitkeep.js'), placeholderContent);
				}
			} catch (error) {
				console.error(`${LOG_PREFIX} Error setting up collections:`, error);
			}
		},
		config(config) {
			// Pass information about fresh install to the frontend
			if (!config.define) config.define = {};
			config.define.__FRESH_INSTALL__ = JSON.stringify(wasPrivateConfigMissing);
		},
		configureServer(server) {
			serverInstance = server;
			// We need to hook into the listen method to get the final port.
			const originalListen = server.listen;
			server.listen = function (port?: number, isRestart?: boolean) {
				const result = originalListen.apply(this, [port, isRestart]);
				result.then(() => {
					setTimeout(async () => {
						if (!serverInstance?.httpServer) return;
						const address = serverInstance.httpServer.address();
						const resolvedPort = typeof address === 'object' && address ? address.port : 5173;
						const setupUrl = `http://localhost:${resolvedPort}/setup`;

						try {
							// @ts-expect-error - open package has built-in types but dynamic import causes TS error
							const open = (await import('open')).default;
							console.log(`${LOG_PREFIX} Opening \x1b[34msetup wizard\x1b[0m in your browser...`);
							await open(setupUrl);
						} catch {
							const coloredUrl = useColor ? `\x1b[34m${setupUrl}\x1b[0m` : setupUrl;
							console.log(`${LOG_PREFIX} Please open this URL to continue setup: ${coloredUrl}`);
						}
					}, 1000); // Small delay to ensure server is ready
				});
				return result;
			};

			// Add collection file watching even in setup mode
			server.watcher.on('all', (event, file) => {
				const isCollectionFile = file.startsWith(userCollectionsPath) && /\.(ts|js)$/.test(file);

				if (isCollectionFile) {
					console.log(`📁 Collection file event (setup mode): \x1b[33m${event}\x1b[0m - \x1b[34m${path.basename(file)}\x1b[0m`);
					clearTimeout(compileTimeout);
					compileTimeout = setTimeout(async () => {
						try {
							console.log(`${LOG_PREFIX} Compiling collections in setup mode...`);
							await compile({ userCollections: userCollectionsPath, compiledCollections: compiledCollectionsPath });
							console.log('\x1b[32m✅ Collection re-compilation successful!\x1b[0m');
						} catch (error) {
							console.error(`❌ Error compiling collections in setup mode:`, error);
						}
					}, 100); // Debounce changes
				}
			});
		}
	};
}

/**
 * Plugin to compile collections and sync content structure on file changes.
 */
function collectionsWatcherPlugin(): Plugin {
	let compileTimeout: NodeJS.Timeout;
	let lastUnlink = { file: '', time: 0 };
	let initialized = false; // Prevent multiple buildStart executions

	const triggerContentSync = async (server: ViteDevServer) => {
		const req = {
			method: 'POST',
			url: '/api/content-structure',
			headers: { 'content-type': 'application/json', 'x-vite-plugin-request': 'true' },
			body: JSON.stringify({ action: 'recompile' }),
			on: (event: string, callback: (chunk?: Buffer) => void) => {
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

		try {
			await new Promise<void>((resolve) => {
				server.middlewares(req as unknown as IncomingMessage, res as unknown as ServerResponse, resolve);
			});
			console.log('🔄 Content structure sync triggered successfully.');
		} catch (e) {
			console.error('❌ Failed to trigger content structure sync:', e);
		}
	};

	return {
		name: 'svelte-cms-collections-watcher',
		enforce: 'post',
		async buildStart() {
			if (initialized) {
				return; // Prevent multiple executions
			}
			initialized = true;

			console.log(`${LOG_PREFIX} Checking collection synchronization...`);
			try {
				// Ensure both source and compiled collections directories exist
				await fs.mkdir(userCollectionsPath, { recursive: true });
				await fs.mkdir(compiledCollectionsPath, { recursive: true });

				// Check if source collections directory has files
				let sourceFiles: string[] = [];

				try {
					const files = await fs.readdir(userCollectionsPath, { recursive: true });
					sourceFiles = files.filter((file) => typeof file === 'string' && (file.endsWith('.ts') || file.endsWith('.js')));
				} catch (error) {
					console.log(`${LOG_PREFIX} Error reading collections directory, assuming empty:`, error?.message || 'Unknown error');
				}
				if (sourceFiles.length > 0) {
					console.log(`${LOG_PREFIX} Found ${sourceFiles.length} source collection(s), performing compilation...`);
					await compile({ userCollections: userCollectionsPath, compiledCollections: compiledCollectionsPath });
					console.log('\x1b[32m✅ Collection compilation successful!\x1b[0m');
				} else {
					// No source collections found, ensure empty compiled collections directory exists
					console.log(`${LOG_PREFIX} No collections to compile - fresh installation detected.`);
					// Create empty structure to prevent errors
					await fs.mkdir(path.resolve(compiledCollectionsPath, 'Collections'), { recursive: true });
					await fs.mkdir(path.resolve(compiledCollectionsPath, 'Menu'), { recursive: true });
					// Create placeholder files to prevent module loading errors
					const placeholderContent = '// Empty collection placeholder\nexport default {};';
					await fs.writeFile(path.resolve(compiledCollectionsPath, 'Collections', '.gitkeep.js'), placeholderContent);
					await fs.writeFile(path.resolve(compiledCollectionsPath, 'Menu', '.gitkeep.js'), placeholderContent);
				}
			} catch (error) {
				console.error('\x1b[31m❌ Collection setup failed:\x1b[0m', error);
				// Don't throw error for missing collections in fresh installations
				if (!error.message?.includes('ENOENT') && !error.message?.includes('no such file')) {
					throw error;
				}
				console.log(`${LOG_PREFIX} Continuing with empty collections setup...`);
			}
		},
		configureServer(server) {
			server.watcher.on('all', (event, file) => {
				const isCollectionFile = file.startsWith(userCollectionsPath) && /\.(ts|js)$/.test(file);
				const isRolesFile = file === path.resolve(configDir, 'roles.ts');

				if (!isCollectionFile && !isRolesFile) return;

				if (isCollectionFile) {
					console.log(`📁 Collection file event: \x1b[33m${event}\x1b[0m - \x1b[34m${path.basename(file)}\x1b[0m`);
					clearTimeout(compileTimeout);
					compileTimeout = setTimeout(async () => {
						try {
							const now = Date.now();
							if (event === 'unlink') lastUnlink = { file, time: now };
							else if (event === 'add' && now - lastUnlink.time < 100) {
								console.log(`🔄 Detected rename: ${path.basename(lastUnlink.file)} -> ${path.basename(file)}`);
							}

							await compile({ userCollections: userCollectionsPath, compiledCollections: compiledCollectionsPath });
							console.log('\x1b[32m✅ Re-compilation successful!\x1b[0m');
							await generateContentTypes(server);
							await triggerContentSync(server);
						} catch (error) {
							console.error(`❌ Error on collection file ${event}:`, error);
						}
					}, 100); // Debounce changes
				}

				if (isRolesFile) {
					console.log(`🔒 Roles file changed: \x1b[34m${path.basename(file)}\x1b[0m`);
					(async () => {
						try {
							// Find the roles.ts module in Vite's module graph
							const rolesModule = await server.moduleGraph.getModuleByUrl('/config/roles.ts');

							// Invalidate the module to ensure a fresh import
							if (rolesModule) {
								server.moduleGraph.invalidateModule(rolesModule);
							}

							// Re-import the invalidated modules. No cache-buster needed!
							const { roles } = await server.ssrLoadModule('./config/roles.ts');
							const { setLoadedRoles } = await server.ssrLoadModule('./src/auth/types.ts');

							setLoadedRoles(roles);
							server.ws.send({ type: 'full-reload', path: '*' });
							console.log('✅ Roles reloaded and client updated.');
						} catch (err) {
							console.error('❌ Error reloading roles.ts:', err);
						}
					})();
				}
			});
		}
	};
}

// --- Main Config ---
const setupComplete = isSetupComplete();

export default defineConfig((): UserConfig => {
	console.log(setupComplete ? `\n${LOG_PREFIX} Setup complete. Initializing full dev environment...` : `\n${LOG_PREFIX} Starting in setup mode...`);

	return {
		plugins: [
			sveltekit(),
			!setupComplete ? setupWizardPlugin() : collectionsWatcherPlugin(),

			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/paraglide'
			}),
			svelteEmailTailwind({
				pathToEmailFolder: './src/components/emails'
			})
		],

		server: {
			fs: { allow: ['static', '.'] },
			watch: {
				ignored: ['**/config/private.ts', '**/config/private.backup.*.ts']
			}
		},

		resolve: {
			alias: {
				'@root': path.resolve(CWD, './'),
				'@src': path.resolve(CWD, './src'),
				'@components': path.resolve(CWD, './src/components'),
				'@content': path.resolve(CWD, './src/content'),
				'@utils': path.resolve(CWD, './src/utils'),
				'@stores': path.resolve(CWD, './src/stores'),
				'@widgets': path.resolve(CWD, './src/widgets')
			}
		},

		define: {
			__VERSION__: JSON.stringify(PKG.version),
			__FRESH_INSTALL__: false, // Default value, overridden by setupWizardPlugin if needed
			SUPERFORMS_LEGACY: true,
			global: 'globalThis'
		},

		build: {
			target: 'esnext',
			minify: 'esbuild',
			sourcemap: true,
			rollupOptions: {
				onwarn(warning, warn) {
					if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.message.includes('zod-to-json-schema')) return;
					if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.message.includes('node_modules/mongodb')) return;
					if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.message.includes('node_modules/mongoose')) return;
					if (warning.code === 'UNUSED_EXTERNAL_IMPORT') return;
					warn(warning);
				},
				external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`), 'typescript', 'ts-node'],
				output: {
					manualChunks: (id: string) => {
						if (id.includes('node_modules')) {
							if (id.includes('@skeletonlabs/skeleton')) return 'skeleton-ui';
							if (id.includes('tiptap')) return 'tiptap-editor';
							if (id.includes('mongodb') || id.includes('mongoose')) return 'database';
							return 'vendor';
						}
					}
				}
			}
		},

		optimizeDeps: {
			exclude: [...builtinModules, ...builtinModules.map((m) => `node:${m}`)],
			include: ['@skeletonlabs/skeleton']
		}
	};
});
