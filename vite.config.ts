/**
 * @file vite.config.ts
 * @description This file contains the Vite configuration for the SvelteKit project, optimized for performance and developer experience.
 * It employs a unified config structure with conditional plugins for the initial setup wizard vs. normal development mode.
 *
 * Key Features:
 * - Centralized path management and logging utilities.
 * - Efficient, direct Hot Module Replacement (HMR) for content structure without fake HTTP requests.
 * - Dynamic compilation of user-defined collections with real-time feedback.
 * - Seamless integration with Paraglide for i18n and better-svelte-email for email templating.
 */

import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { existsSync, promises as fs } from 'fs';
import { builtinModules } from 'module';
import path from 'path';
import type { Plugin, UserConfig, ViteDevServer } from 'vite';
import { defineConfig } from 'vite';
import { compile } from './src/utils/compilation/compile';
import { isSetupComplete } from './src/utils/setupCheck';
import { securityCheckPlugin } from './src/utils/vitePluginSecurityCheck';
import { exec } from 'node:child_process';
import { platform } from 'node:os';

// Cross-platform open URL function (replaces 'open' package)
function openUrl(url: string) {
	const plat = platform();
	let cmd;
	if (plat === 'win32') {
		cmd = `start "" "${url}"`;
	} else if (plat === 'darwin') {
		cmd = `open "${url}"`;
	} else {
		cmd = `xdg-open "${url}"`;
	}
	exec(cmd);
}

/**
 * Vite plugin that provides a fallback for @config/private and @config/private.test when the file doesn't exist
 * This allows builds to succeed in fresh clones without committing sensitive credentials
 */
function privateConfigFallbackPlugin(): Plugin {
	const virtualModuleId = '@config/private';
	const virtualTestModuleId = '@config/private.test';
	const resolvedVirtualModuleId = '\0' + virtualModuleId;
	const resolvedVirtualTestModuleId = '\0' + virtualTestModuleId;

	return {
		name: 'private-config-fallback',
		resolveId(id) {
			if (id === virtualModuleId) {
				// Check if actual file exists
				const prodPath = path.resolve(CWD, 'config/private.ts');
				if (existsSync(prodPath)) {
					return null; // Let Vite handle it normally
				}
				// File doesn't exist, use virtual module
				return resolvedVirtualModuleId;
			}
			if (id === virtualTestModuleId) {
				// Check if actual file exists
				const testPath = path.resolve(CWD, 'config/private.test.ts');
				if (existsSync(testPath)) {
					return null; // Let Vite handle it normally
				}
				// File doesn't exist, use virtual module
				return resolvedVirtualTestModuleId;
			}
		},
		load(id) {
			if (id === resolvedVirtualModuleId || id === resolvedVirtualTestModuleId) {
				// Provide fallback that reads from environment variables
				return `
export const privateEnv = {
	DB_TYPE: process.env.DB_TYPE || 'mongodb',
	DB_HOST: process.env.DB_HOST || 'localhost',
	DB_PORT: parseInt(process.env.DB_PORT || '27017'),
	DB_NAME: process.env.DB_NAME || 'sveltycms',
	DB_USER: process.env.DB_USER || '',
	DB_PASSWORD: process.env.DB_PASSWORD || '',
	JWT_SECRET_KEY: process.env.JWT_SECRET_KEY || '',
	ENCRYPTION_KEY: process.env.ENCRYPTION_KEY || '',
	GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
	GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
	MULTI_TENANT: process.env.MULTI_TENANT === 'true'
} as const;
`;
			}
		}
	};
}

// --- Constants & Configuration ---
const CWD = process.cwd();
const paths = {
	configDir: path.resolve(CWD, 'config'),
	privateConfig: path.resolve(CWD, 'config/private.ts'),
	userCollections: path.resolve(CWD, 'config/collections'),
	compiledCollections: path.resolve(CWD, 'compiledCollections'),
	widgets: path.resolve(CWD, 'src/widgets')
};

// --- Utilities ---
const useColor = process.stdout.isTTY;

// Standardized logger for build-time scripts, mimicking the main application logger's style.
// Colored tag printed once so message-local color codes render correctly.
const TAG = useColor ? `\x1b[34m[SveltyCMS]\x1b[0m` : `[SveltyCMS]`;

const log = {
	// Info level — tag is blue, message follows (may contain its own color codes)
	info: (message: string) => console.log(`${TAG} ${message}`),
	// Custom success level for clarity in build process
	success: (message: string) => console.log(`${TAG} ${useColor ? `✅ \x1b[32m${message}\x1b[0m` : `✅ ${message}`}`),
	// Corresponds to 'warn' level
	warn: (message: string) => console.warn(`${TAG} ${useColor ? `⚠️ \x1b[33m${message}\x1b[0m` : `⚠️ ${message}`}`),
	// Corresponds to 'error' level
	error: (message: string, error?: unknown) => console.error(`${TAG} ${useColor ? `❌ \x1b[31m${message}\x1b[0m` : `❌ ${message}`}`, error ?? '')
};

/**
 * Ensures collection directories exist and performs an initial compilation if needed.
 * Creates placeholder files if no collections are found to prevent module import errors.
 */
async function initializeCollectionsStructure() {
	// Prevent double compilation in the same process
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	if ((globalThis as any).__COLLECTIONS_COMPILED__) {
		return;
	}
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	(globalThis as any).__COLLECTIONS_COMPILED__ = true;

	await fs.mkdir(paths.userCollections, { recursive: true });
	await fs.mkdir(paths.compiledCollections, { recursive: true });

	const sourceFiles = (await fs.readdir(paths.userCollections, { recursive: true })).filter(
		(file): file is string => typeof file === 'string' && (file.endsWith('.ts') || file.endsWith('.js'))
	);

	if (sourceFiles.length > 0) {
		log.info(`Found \x1b[32m${sourceFiles.length}\x1b[0m collection(s), compiling...`);
		await compile({ userCollections: paths.userCollections, compiledCollections: paths.compiledCollections });
		log.success('Initial collection compilation successful!');
	} else {
		log.info('No user collections found. Creating placeholder structure.');
		const placeholderContent = '// This is a placeholder file generated by Vite.\nexport default {};';
		const collectionsDir = path.resolve(paths.compiledCollections, 'Collections');
		const menuDir = path.resolve(paths.compiledCollections, 'Menu');

		await fs.mkdir(collectionsDir, { recursive: true });
		await fs.mkdir(menuDir, { recursive: true });
		await fs.writeFile(path.resolve(collectionsDir, '_placeholder.js'), placeholderContent);
		await fs.writeFile(path.resolve(menuDir, '_placeholder.js'), placeholderContent);
	}
}

// Force exit on SIGINT to prevent hanging processes
process.on('SIGINT', () => {
	log.warn('\nReceived SIGINT, forcing exit...');
	process.exit(0);
});

// --- Vite Plugins ---

/**
 * A lightweight plugin to handle the initial setup wizard.
 * Checks if private.ts exists and opens the setup page if needed.
 * The setup wizard will create private.ts with real credentials.
 */
function setupWizardPlugin(): Plugin {
	let wasPrivateConfigMissing = false;

	return {
		name: 'svelty-cms-setup-wizard',
		async buildStart() {
			// 🔍 CHECK ONLY: Don't create blank template
			// The setup wizard will create private.ts with real database credentials
			wasPrivateConfigMissing = !existsSync(paths.privateConfig);

			if (wasPrivateConfigMissing) {
				// Ensure config directory exists (but don't create the file)
				await fs.mkdir(paths.configDir, { recursive: true });
				log.info('Setup mode: config/private.ts will be created during setup wizard');
			} else {
				log.info('Setup complete: config/private.ts exists');
			}

			// Ensure collections are ready even in setup mode
			await initializeCollectionsStructure();
		},
		config: () => ({
			define: { __FRESH_INSTALL__: JSON.stringify(wasPrivateConfigMissing) }
		}),
		configureServer(server) {
			// Only open setup wizard if private.ts is missing
			if (!wasPrivateConfigMissing) {
				return; // Setup already completed, skip browser opening
			}

			const originalListen = server.listen;
			server.listen = function (port?: number, isRestart?: boolean) {
				const result = originalListen.apply(this, [port, isRestart]);
				result.then(() => {
					setTimeout(async () => {
						const address = server.httpServer?.address();
						const resolvedPort = typeof address === 'object' && address ? address.port : 5173;
						const setupUrl = `http://localhost:${resolvedPort}/setup`;

						try {
							log.info(`Opening setup wizard in your browser...`);
							openUrl(setupUrl);
						} catch {
							const coloredUrl = useColor ? `\x1b[34m${setupUrl}\x1b[0m` : setupUrl;
							log.info(`Please open this URL to continue setup: ${coloredUrl}`);
						}
					}, 1000);
				});
				return result;
			};
		}
	};
}

/**
 * Plugin to watch for changes in collections and widgets, triggering
 * recompilation and efficient HMR updates.
 */
function cmsWatcherPlugin(): Plugin {
	let compileTimeout: NodeJS.Timeout;
	let widgetTimeout: NodeJS.Timeout; // Debounce timer for widgets

	const handleHmr = async (server: ViteDevServer, file: string) => {
		const isCollectionFile = file.startsWith(paths.userCollections) && /\.(ts|js)$/.test(file);
		const isWidgetFile = file.startsWith(paths.widgets) && (file.endsWith('index.ts') || file.endsWith('.svelte'));

		if (isCollectionFile) {
			clearTimeout(compileTimeout);
			compileTimeout = setTimeout(async () => {
				log.info(`Collection change detected. Recompiling...`);
				try {
					await compile({
						userCollections: paths.userCollections,
						compiledCollections: paths.compiledCollections,
						targetFile: file // Pass the specific file that changed
					});
					log.success(`Re-compilation successful for ${path.basename(file)}!`);

					// Register collection models in database after recompilation
					try {
						const { dbAdapter } = await server.ssrLoadModule('./src/databases/db.ts?t=' + Date.now());
						if (dbAdapter && dbAdapter.collection) {
							const { scanCompiledCollections } = await server.ssrLoadModule('./src/content/collectionScanner.ts?t=' + Date.now());
							const collections = await scanCompiledCollections();
							log.info(`Found ${collections.length} collections, registering models...`);

							// Register each collection sequentially with delay (prevent race condition)
							for (const schema of collections) {
								await dbAdapter.collection.createModel(schema);
								await new Promise((resolve) => setTimeout(resolve, 100)); // 100ms delay
							}
							log.success(`Collection models registered! (${collections.length} total)`);
						} else {
							log.warn('Database adapter not available, skipping model registration');
						}
					} catch (dbError) {
						log.error('Failed to register collection models (non-fatal):', dbError);
						// Don't fail the entire HMR process
					}

					const { generateContentTypes } = await server.ssrLoadModule('./src/content/vite.ts');
					await generateContentTypes(server);
					log.info('Content structure types regenerated.');
					server.ws.send({ type: 'full-reload', path: '*' });
				} catch (error) {
					log.error(`Error recompiling collections:`, error);
				}
			}, 150); // Debounce changes
		}

		// ---  WATCHER LOGIC  ---
		if (isWidgetFile) {
			clearTimeout(widgetTimeout);
			widgetTimeout = setTimeout(async () => {
				log.info(`Widget file change detected. Reloading widget store...`);
				try {
					// Invalidate and reload the widget store module to get the latest code
					const { widgetStoreActions } = await server.ssrLoadModule('./src/stores/widgetStore.svelte.ts?t=' + Date.now());
					// Call the reload action, which re-scans the filesystem
					await widgetStoreActions.reloadWidgets();
					// Trigger a full reload on the client to reflect the changes
					server.ws.send({ type: 'full-reload', path: '*' });
					log.success('Widgets reloaded and client updated.');
				} catch (err) {
					log.error('Error reloading widgets:', err);
				}
			}, 150); // Debounce changes
		}
	};

	return {
		name: 'svelty-cms-watcher',
		enforce: 'post',
		async buildStart() {
			await initializeCollectionsStructure();
		},
		configureServer(server) {
			server.watcher.on('all', (event, file) => {
				if (event === 'add' || event === 'change' || event === 'unlink') {
					handleHmr(server, file);
				}
			});
		}
	};
}

// --- Main Vite Configuration ---
const setupComplete = isSetupComplete();
const isBuild = process.env.NODE_ENV === 'production' || process.argv.includes('build');

export default defineConfig((): UserConfig => {
	// Only log during dev mode, not during builds
	if (!isBuild) {
		if (setupComplete) {
			log.success('Setup check passed. Initializing full dev environment...');
		} else {
			log.info('Starting in setup mode...');
		}
	}

	return {
		plugins: [
			tailwindcss(),
			// Private config fallback - provides virtual module when file doesn't exist
			privateConfigFallbackPlugin(),
			// Security check plugin runs first to detect private setting imports
			securityCheckPlugin({
				failOnError: true,
				showWarnings: true,
				extensions: ['.svelte', '.ts', '.js']
			}),
			sveltekit(),
			!setupComplete ? setupWizardPlugin() : cmsWatcherPlugin(),
			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/paraglide'
			})
		],
		server: {
			fs: {
				allow: ['static', '.'],
				deny: ['**/tests/**']
			},
			watch: {
				// Prevent watcher from triggering on generated/sensitive files
				ignored: ['**/config/private.ts', '**/config/private.backup.*.ts', '**/compiledCollections/**', '**/tests/**']
			}
		},
		ssr: {
			noExternal: [],
			external: ['bun:test', 'redis']
		},
		resolve: {
			alias: {
				'@root': path.resolve(CWD, './'),
				'@src': path.resolve(CWD, './src'),
				'@components': path.resolve(CWD, './src/components'),
				'@content': path.resolve(CWD, './src/content'),
				'@databases': path.resolve(CWD, './src/databases'),
				'@config': path.resolve(__dirname, 'config'),
				'@utils': path.resolve(CWD, './src/utils'),
				'@stores': path.resolve(CWD, './src/stores'),
				'@widgets': path.resolve(CWD, './src/widgets')
			}
		},
		define: {
			__FRESH_INSTALL__: false, // Default, may be overridden by setupWizardPlugin
			global: 'globalThis', // `global` polyfill for libraries that expect it (e.g., older crypto libs)
			'import.meta.env.VITE_LOG_LEVELS': JSON.stringify(process.env.LOG_LEVELS || (isBuild ? 'info,warn,error' : 'info,warn,error,debug'))
		},
		build: {
			target: 'esnext',
			minify: 'esbuild',
			sourcemap: true,
			chunkSizeWarningLimit: 600, // Increase from 500KB (after optimizations)
			rollupOptions: {
				// Aggressive tree-shaking for production builds
				treeshake: {
					moduleSideEffects: false, // Assume modules have no side effects unless marked
					propertyReadSideEffects: false // Allow property reads to be removed
				},
				onwarn(warning, warn) {
					// Suppress circular dependency warnings from third-party libraries
					if (warning.code === 'CIRCULAR_DEPENDENCY' && warning.message.includes('node_modules')) {
						return;
					}
					// Suppress unused external import warnings
					if (warning.code === 'UNUSED_EXTERNAL_IMPORT') {
						return;
					}
					// Suppress eval warnings from Vite (common in dev dependencies)
					if (warning.code === 'EVAL' && warning.id?.includes('node_modules')) {
						return;
					}
					// Suppress "dynamic import will not move module" warnings for specific files where this is intentional.
					// See /docs/architecture/state-management.mdx for details.
					if (warning.message?.includes('dynamic import will not move module')) {
						const isWidgetStore = warning.id?.includes('widgetStore.svelte.ts');
						const isRichTextInput = warning.id?.includes('richText/Input.svelte');
						const isSettingsService = warning.id?.includes('services/settingsService.ts');
						const isDb = warning.id?.includes('databases/db.ts');
						if (isWidgetStore || isRichTextInput || isSettingsService || isDb) {
							return;
						}
					}
					// Show all other warnings
					warn(warning);
				},
				external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`), 'typescript', 'ts-node']
			}
		},
		optimizeDeps: {
			exclude: [...builtinModules, ...builtinModules.map((m) => `node:${m}`), 'redis', '@src/databases/CacheService'],
			include: ['@skeletonlabs/skeleton'],
			entries: ['!tests/**/*', '!**/*.server.ts', '!**/*.server.js']
		}
	};
});
