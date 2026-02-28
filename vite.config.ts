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

import { exec } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import { builtinModules } from 'node:module';
import { platform } from 'node:os';
import path from 'node:path';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin, UserConfig, ViteDevServer } from 'vite';
import { defineConfig } from 'vite';
import { compile } from './src/utils/compilation/compile';
import { isSetupComplete } from './src/utils/setup-check';
import { securityCheckPlugin } from './src/utils/vite-plugin-security-check';

// Cross-platform open URL function (replaces 'open' package)
function openUrl(url: string) {
	const plat = platform();
	let cmd: string;
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
 * Plugin to alias @config/private to config/private.test.ts when running in TEST_MODE.
 * This allows local tests to use an isolated configuration without modifying the production config.
 */
function _testConfigAliasPlugin(): Plugin {
	return {
		name: 'test-config-alias',
		enforce: 'pre',
		resolveId(id) {
			if (process.env.TEST_MODE !== 'true') {
				return;
			}

			// Check for direct import or alias
			if (id === '@config/private' || id.endsWith('config/private.ts')) {
				const cwd = process.cwd();
				const testConfigPath = path.resolve(cwd, 'config/private.test.ts');
				// Only alias if the test config actually exists
				if (existsSync(testConfigPath)) {
					log.info('Test Mode: Aliasing @config/private to config/private.test.ts');
					return testConfigPath;
				}
			}
		}
	};
}

/**
 * Vite plugin that provides a fallback for @config/private and @config/private.test when the file doesn't exist
 * This allows builds to succeed in fresh clones without committing sensitive credentials
 */
function _privateConfigFallbackPlugin(): Plugin {
	const virtualModuleId = '@config/private';
	const virtualTestModuleId = '@config/private.test';
	const resolvedVirtualModuleId = `\0${virtualModuleId}`;
	const resolvedVirtualTestModuleId = `\0${virtualTestModuleId}`;

	return {
		name: 'private-config-fallback',
		enforce: 'pre',
		resolveId(id) {
			const cwd = process.cwd();
			const normalizedId = id.replace(/\\/g, '/');

			// Define all possible variations of the private config path
			const privatePaths = [
				virtualModuleId,
				path.join(cwd, 'config/private').replace(/\\/g, '/'),
				path.join(cwd, 'config/private.ts').replace(/\\/g, '/'),
				'@config/private'
			];

			const testPaths = [
				virtualTestModuleId,
				path.join(cwd, 'config/private.test').replace(/\\/g, '/'),
				path.join(cwd, 'config/private.test.ts').replace(/\\/g, '/'),
				'@config/private.test'
			];

			if (privatePaths.some((p) => normalizedId === p || normalizedId.endsWith('config/private') || normalizedId.endsWith('config/private.ts'))) {
				// Check if actual file exists
				const prodPath = path.resolve(cwd, 'config/private.ts');
				if (existsSync(prodPath)) {
					return null; // Let Vite handle it normally
				}
				// File doesn't exist, use virtual module
				return resolvedVirtualModuleId;
			}
			if (
				testPaths.some((p) => normalizedId === p || normalizedId.endsWith('config/private.test') || normalizedId.endsWith('config/private.test.ts'))
			) {
				// Check if actual file exists
				const testPath = path.resolve(cwd, 'config/private.test.ts');
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
	DB_TYPE: process.env.DB_TYPE || '',
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
};
export const __VIRTUAL__ = true;
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
	userCollections: path.resolve(CWD, process.env.COLLECTIONS_DIR || 'config/collections'),
	compiledCollections: path.resolve(CWD, process.env.COMPILED_COLLECTIONS_DIR || '.compiledCollections'),
	widgets: path.resolve(CWD, 'src/widgets')
};

// --- Utilities ---
const useColor = process.stdout.isTTY;

// Standardized logger for build-time scripts, mimicking the main application logger's style.
// Colored tag printed once so message-local color codes render correctly.
const TAG = useColor ? '\x1b[34m[SveltyCMS]\x1b[0m' : '[SveltyCMS]';

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
 */
async function initializeCollectionsStructure() {
	// Prevent double compilation in the same process
	if ((globalThis as any).__COLLECTIONS_COMPILED__) {
		return;
	}
	(globalThis as any).__COLLECTIONS_COMPILED__ = true;

	await fs.mkdir(paths.userCollections, { recursive: true });
	await fs.mkdir(paths.compiledCollections, { recursive: true });

	const sourceFiles = (await fs.readdir(paths.userCollections, { recursive: true })).filter(
		(file): file is string => typeof file === 'string' && (file.endsWith('.ts') || file.endsWith('.js'))
	);

	if (sourceFiles.length > 0) {
		log.info(`Found \x1b[32m${sourceFiles.length}\x1b[0m collection(s), compiling...`);
		await compile({
			userCollections: paths.userCollections,
			compiledCollections: paths.compiledCollections
		});
		log.success('Initial collection compilation successful!');
	} else {
		log.info('No user collections found. Starting with empty structure.');
	}
}

// Force exit on SIGINT to prevent hanging processes
process.on('SIGINT', () => {
	log.warn('\nReceived SIGINT, forcing exit...');
	process.exit(0);
});

// --- Vite Plugins ---

/**
 * Plugin to suppress noisy third-party warnings during build
 */
function _suppressThirdPartyWarningsPlugin(): Plugin {
	let originalConsoleWarn: typeof console.warn | undefined;
	let isIntercepted = false;
	const warningPatterns = [
		/Circular dependency:.*node_modules/,
		/".*" is imported from external module ".*" but never used/,
		/".*" is imported by ".*", but could not be resolved – treating it as an external dependency/
	];

	return {
		name: 'suppress-third-party-warnings',
		buildStart() {
			if (!isIntercepted) {
				isIntercepted = true;
				originalConsoleWarn = console.warn;
				console.warn = (...args: unknown[]) => {
					const message = typeof args[0] === 'string' ? args[0] : String(args[0] ?? '');
					// Explicitly ignore circular dependency warnings for the build page/status components
					if (message.includes('Circular dependency') && (message.includes('status') || message.includes('build'))) {
						return;
					}
					if (warningPatterns.some((pattern) => pattern.test(message))) {
						return;
					}
					(originalConsoleWarn as typeof console.warn).apply(console, args);
				};
			}
		},
		buildEnd() {
			/* restore console.warn */
		},
		closeBundle() {
			/* ensure cleanup */
		}
	};
}

/**
 * Plugin to stub out server-only modules in the client build.
 * This prevents unnecessary bundling of heavy server dependencies and fixes "ENOENT" or "cannot find module" errors
 * in the client bundle for files that should only run on the server.
 */
function stubServerModulesPlugin(): Plugin {
	return {
		name: 'stub-server-modules',
		enforce: 'pre',
		resolveId(id, _importer, options) {
			// Stub out anything ending in .server.ts, .server.js, or .server directory (if used)
			if (!options?.ssr) {
				// Only stub for client build
				if (id.includes('.server') || id.endsWith('privateSettings.server')) {
					return '\0stub-server-module';
				}
			}
			return null;
		},
		load(id) {
			if (id === '\0stub-server-module') {
				return 'export default {}; export const getPrivateSettingSync = () => ({}); export const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };';
			}
			return null;
		}
	};
}

/**
 * A lightweight plugin to handle the initial setup wizard.
 * Checks if private.ts exists and opens the setup page if needed.
 * The setup wizard will create private.ts with real credentials.
 */
/**
 * Unified plugin to handle both setup wizard and CMS watching.
 * Dynamically switches behavior based on whether setup is complete.
 */
function sveltyCmsPlugin(): Plugin {
	let wasPrivateConfigMissing = false;
	let compileTimeout: NodeJS.Timeout;
	let widgetTimeout: NodeJS.Timeout;

	const handleHmr = async (server: ViteDevServer, file: string) => {
		// Use absolute paths for comparison to avoid Windows issues
		const absoluteFile = path.resolve(file);
		const isCollectionFile = absoluteFile.startsWith(paths.userCollections) && /\.(ts|js)$/.test(file);
		const isWidgetFile = absoluteFile.startsWith(paths.widgets) && (file.endsWith('index.ts') || file.endsWith('.svelte'));

		if (isCollectionFile) {
			clearTimeout(compileTimeout);
			compileTimeout = setTimeout(async () => {
				log.info('Collection change detected. Recompiling...');
				try {
					await compile({
						userCollections: paths.userCollections,
						compiledCollections: paths.compiledCollections,
						targetFile: file
					});
					log.success(`Re-compilation successful for ${path.basename(file)}!`);

					// Register collection models in database after recompilation
					// Only attempt this if setup is complete
					if (isSetupComplete()) {
						try {
							const { dbAdapter } = await server.ssrLoadModule(path.join(CWD, 'src/databases/db.ts'));
							if (dbAdapter?.collection) {
								const { scanCompiledCollections } = await server.ssrLoadModule(path.join(CWD, 'src/content/collection-scanner.ts'));
								const collections = await scanCompiledCollections();
								log.info(`Found ${collections.length} collections, registering models...`);

								for (const schema of collections) {
									await dbAdapter.collection.createModel(schema);
									await new Promise((resolve) => setTimeout(resolve, 50));
								}
								log.success(`Collection models registered! (${collections.length} total)`);
							}
						} catch (dbError) {
							log.error('Failed to register collection models (non-fatal):', dbError);
						}
					}

					const { generateContentTypes } = await server.ssrLoadModule(path.join(CWD, 'src/content/vite.ts'));
					await generateContentTypes(server);
					server.ws.send({ type: 'full-reload', path: '*' });
				} catch (error) {
					log.error('Error recompiling collections:', error);
				}
			}, 150);
		}

		if (isWidgetFile) {
			clearTimeout(widgetTimeout);
			widgetTimeout = setTimeout(async () => {
				log.info('Widget file change detected. Reloading widget store...');
				try {
					const { widgetStoreActions } = await server.ssrLoadModule(path.join(CWD, 'src/stores/widget-store.svelte.ts'));
					await widgetStoreActions.reload();
					server.ws.send({ type: 'full-reload', path: '*' });
					log.success('Widgets reloaded and client updated.');
				} catch (err) {
					log.error('Error reloading widgets:', err);
				}
			}, 150);
		}
	};

	return {
		name: 'svelty-cms-main',
		async buildStart() {
			wasPrivateConfigMissing = !existsSync(paths.privateConfig);
			if (wasPrivateConfigMissing) {
				await fs.mkdir(paths.configDir, { recursive: true });
				log.info('Setup mode: config/private.ts missing');
			}
			await initializeCollectionsStructure();
		},
		config: () => ({
			define: { __FRESH_INSTALL__: JSON.stringify(wasPrivateConfigMissing) }
		}),
		configureServer(server) {
			// Watch for changes regardless of setup status
			server.watcher.on('all', (event, file) => {
				if (event === 'add' || event === 'change' || event === 'unlink') {
					handleHmr(server, file);
				}
			});

			// Only open setup wizard if config is missing
			if (wasPrivateConfigMissing) {
				const originalListen = server.listen;
				server.listen = function (port?: number, isRestart?: boolean) {
					const result = originalListen.apply(this, [port, isRestart]);
					result.then(() => {
						setTimeout(() => {
							const address = server.httpServer?.address();
							const resolvedPort = typeof address === 'object' && address ? address.port : 5173;
							const setupUrl = `http://localhost:${resolvedPort}/setup`;
							log.info(`Opening setup wizard: ${setupUrl}`);
							openUrl(setupUrl);
						}, 1000);
					});
					return result;
				};
			}
		}
	};
}

/**
 * Plugin to capture build metadata (time, module counts) for analytics.
 * Writes to .svelte-kit/output/build-metadata-{client|server}.json
 */
function _buildMetadataPlugin(): Plugin {
	let startTime: number;
	let isSSR = false;
	const outputPath = path.resolve(CWD, '.svelte-kit/output');

	return {
		name: 'svelty-cms-build-metadata',
		apply: 'build', // Only run during build
		configResolved(config) {
			isSSR = !!config.build.ssr;
		},
		buildStart() {
			startTime = performance.now();
		},
		async generateBundle(_options, bundle) {
			const duration = performance.now() - startTime;
			const moduleCount = Object.keys(bundle).length; // Rough count of chunks/assets

			// Create output directory if it doesn't exist (it should, but safety first)
			if (!existsSync(outputPath)) {
				await fs.mkdir(outputPath, { recursive: true });
			}

			const metadata = {
				timestamp: new Date().toISOString(),
				type: isSSR ? 'server' : 'client',
				duration,
				moduleCount
			};

			const filename = `build-metadata-${isSSR ? 'server' : 'client'}.json`;
			await fs.writeFile(path.resolve(outputPath, filename), JSON.stringify(metadata, null, 2));

			// Log explicitly to console for immediate visibility
			const color = isSSR ? '\x1b[36m' : '\x1b[32m'; // Cyan for server, Green for client
			const reset = '\x1b[0m';
			console.log(`${TAG} ${color}${isSSR ? 'Server' : 'Client'} build completed in ${duration.toFixed(2)}ms (${moduleCount} chunks/assets)${reset}`);
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
			stubServerModulesPlugin(),
			sveltekit(),
			sveltyCmsPlugin(),
			securityCheckPlugin(),
			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/paraglide'
			}),
			tailwindcss()
		],
		server: {
			fs: {
				allow: ['static', '.'],
				deny: ['**/tests/**']
			},
			watch: {
				// Prevent watcher from triggering on generated/sensitive files
				ignored: [
					'**/config/private.ts',
					'**/config/private.backup.*.ts',
					'**/.compiledCollections/**',
					'**/tests/**',
					'**/src/content/types.ts',
					'**/src/paraglide/**'
				]
			}
		},
		ssr: {
			noExternal: [
				'@skeletonlabs/skeleton-svelte',
				'@skeletonlabs/skeleton',
				'@iconify/svelte',
				'svelte-confetti',
				'svelte-canvas',
				'svelte-dnd-action',
				'svelte-awesome-color-picker'
			],
			external: ['bun:sqlite', 'bun:test', 'redis']
		},
		resolve: {
			alias: {
				'@root': path.resolve(CWD, './'),
				'@src': path.resolve(CWD, './src'),
				'@components': path.resolve(CWD, './src/components'),
				'@content': path.resolve(CWD, './src/content'),
				'@databases': path.resolve(CWD, './src/databases'),
				'@config': path.resolve(CWD, 'config'),
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
				// Tree-shaking with preserved side effects for critical packages
				treeshake: {
					// Preserve side-effect imports for packages that need them
					moduleSideEffects: (id) => {
						// These packages have important side effects that must not be removed
						if (id.includes('paraglide') || id.includes('iconify-icon')) {
							return true;
						}
						// Default: assume no side effects for other modules
						return false;
					},
					propertyReadSideEffects: false // Allow property reads to be removed
				},
				output: {
					manualChunks: (id) => {
						// Separate server-side heavy libraries into their own chunk
						// This doesn't remove them (stubbing failed), but isolates them
						if (id.includes('node_modules')) {
							if (id.includes('mongoose') || id.includes('mongodb')) {
								return 'vendor-db-mongo';
							}
							if (id.includes('@aws-sdk') || id.includes('aws-crt')) {
								return 'vendor-aws';
							}
							if (id.includes('mapbox-gl')) {
								return 'vendor-maps';
							}
							if (id.includes('googleapis') || id.includes('google-auth-library')) {
								return 'vendor-google';
							}
							if (id.includes('chart.js') || id.includes('chartjs')) {
								return 'vendor-charts';
							}
						}
					}
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
						const isWidgetStore = warning.id?.includes('widget-store.svelte.ts');
						const isRichTextInput = warning.id?.includes('rich-text/input.svelte');
						const isSettingsService = warning.id?.includes('services/settings-service.ts');
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
			exclude: [
				...builtinModules,
				...builtinModules.map((m) => `node:${m}`),
				'redis',
				'@src/databases/CacheService',
				'@skeletonlabs/skeleton-svelte',
				'@skeletonlabs/skeleton',
				'@iconify/svelte',
				'svelte-confetti',
				'svelte-canvas',
				'svelte-dnd-action',
				'svelte-awesome-color-picker'
			],
			include: [],
			entries: ['!tests/**/*', '!**/*.server.ts', '!**/*.server.js']
		}
	};
});
