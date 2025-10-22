/**
 * @file apps/cms/vite.config.ts
 * @description Vite configuration for the CMS application in NX monorepo.
 *
 * ARCHITECTURE DECISION: Standalone Setup Wizard ✅
 * ================================================
 *
 * The CMS now operates independently with **NO embedded setup wizard**.
 * Setup is handled by a separate app (`apps/setup-wizard/`) that runs first.
 *
 * Benefits:
 * - **Reduced bundle size**: ~500KB savings (setup wizard code removed)
 * - **Faster boot time**: No setup checks, no conditional plugin loading
 * - **Production ready**: No setup routes exposed in production builds
 * - **Cleaner code**: CMS focused on content management only
 *
 * Setup Flow:
 * 1. User runs `cd apps/setup && bun run dev` (first time)
 * 2. Setup wizard creates `apps/cms/config/private.ts`
 * 3. User stops setup, runs `cd apps/cms && bun run dev`
 * 4. CMS detects config → boots normally
 *
 * Configuration Check:
 * - If `config/private.ts` is missing → Error message with instructions
 * - No automatic redirect to setup wizard (different app)
 * - User must manually run setup wizard app
 *
 * Development Mode:
 * - Enables full CMS functionality with HMR for collections, roles, and widgets
 * - Watches for changes and recompiles collections automatically
 * - Database model registration after collection changes
 *
 * NX Monorepo Context:
 * - All paths are relative to CMS app root (apps/cms/)
 * - Config/collections: ./config (not ../../config)
 * - Compiled output: ./compiledCollections (not ../../compiledCollections)
 * - Logs: ./logs (not ../../logs)
 * - Setup wizard: ../setup-wizard (separate app, not embedded route)
 *
 * Key Features:
 * - Centralized path management for NX workspace structure
 * - Efficient Hot Module Replacement (HMR) for roles, collections, and widgets
 * - Dynamic compilation of user-defined collections with real-time feedback
 * - Database model registration after collection changes (prevents "model not found" errors)
 * - Seamless integration with Paraglide (i18n) and svelte-email-tailwind
 */

import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import { promises as fs } from 'fs';
import { builtinModules } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import svelteEmailTailwind from 'svelte-email-tailwind/vite';
import type { Plugin, UserConfig, ViteDevServer } from 'vite';
import { defineConfig, createLogger } from 'vite';
import { compile } from '@utils/compile';
import { isSetupComplete } from './src/utils/setupCheck';
import { securityCheckPlugin } from './src/utils/vitePluginSecurityCheck';

// --- Constants & Configuration ---

// Get the directory of this file (apps/cms/)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Get workspace root (parent of apps/)
const workspaceRoot = path.resolve(__dirname, '../..');

const paths = {
	configDir: path.resolve(workspaceRoot, 'config'),
	privateConfig: path.resolve(workspaceRoot, 'config/private.ts'),
	userCollections: path.resolve(workspaceRoot, 'config/collections'),
	compiledCollections: path.resolve(workspaceRoot, 'compiledCollections'),
	roles: path.resolve(workspaceRoot, 'config/roles.ts'),
	widgets: path.resolve(__dirname, 'src/widgets')
};

// --- Utilities ---
const useColor = process.stdout.isTTY;

/**
 * Standardized logger for build-time scripts, mimicking the main application logger's style.
 */
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
let hasLoggedCollectionInit = false; // Prevent duplicate logs during multi-build

async function initializeCollectionsStructure() {
	await fs.mkdir(paths.userCollections, { recursive: true });
	await fs.mkdir(paths.compiledCollections, { recursive: true });

	const sourceFiles = (await fs.readdir(paths.userCollections, { recursive: true })).filter(
		(file): file is string => typeof file === 'string' && (file.endsWith('.ts') || file.endsWith('.js'))
	);

	if (sourceFiles.length > 0) {
		if (!hasLoggedCollectionInit) {
			log.info(`Found \x1b[32m${sourceFiles.length}\x1b[0m collection(s), compiling...`);
		}
		await compile({ userCollections: paths.userCollections, compiledCollections: paths.compiledCollections });
		if (!hasLoggedCollectionInit) {
			log.success('Initial collection compilation successful!');
			hasLoggedCollectionInit = true;
		}
	} else {
		if (!hasLoggedCollectionInit) {
			log.info('No user collections found. Creating placeholder structure.');
			hasLoggedCollectionInit = true;
		}
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
 * Plugin to watch for changes in collections, roles, and widgets, triggering
 * recompilation and efficient HMR updates.
 */
function cmsWatcherPlugin(): Plugin {
	let compileTimeout: NodeJS.Timeout;
	let widgetTimeout: NodeJS.Timeout; // Debounce timer for widgets

	const handleHmr = async (server: ViteDevServer, file: string) => {
		const isCollectionFile = file.startsWith(paths.userCollections) && /\.(ts|js)$/.test(file);
		const isRolesFile = file === paths.roles;
		const isWidgetFile = file.startsWith(paths.widgets) && (file.endsWith('index.ts') || file.endsWith('.svelte'));

		if (isCollectionFile) {
			clearTimeout(compileTimeout);
			compileTimeout = setTimeout(async () => {
				log.info(`Collection change detected. Recompiling...`);
				try {
					await compile({ userCollections: paths.userCollections, compiledCollections: paths.compiledCollections });
					log.success('Re-compilation successful!');

					// ✅ NEW: Register collection models in database after recompilation
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

		if (isRolesFile) {
			log.info('Roles file changed. Performing HMR...');
			try {
				const { roles } = await server.ssrLoadModule('./config/roles.ts?t=' + Date.now());
				const { setLoadedRoles } = await server.ssrLoadModule('./src/auth/types.ts?t=' + Date.now());
				setLoadedRoles(roles);
				server.ws.send({ type: 'full-reload', path: '*' });
				log.success('Roles reloaded and client updated.');
			} catch (err) {
				log.error('Error reloading roles.ts:', err);
			}
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
const isBuild = process.env.NODE_ENV === 'production' || process.argv.includes('build');

const customLogger = createLogger();
const originalWarn = customLogger.warn;
customLogger.warn = (msg, options) => {
	if (msg.includes('Circular dependency')) {
		return;
	}
	originalWarn(msg, options);
};

export default defineConfig((): UserConfig => {
	// Check if setup is complete (only log during dev mode)
	if (!isBuild) {
		const setupComplete = isSetupComplete();
		if (setupComplete) {
			log.success('Configuration detected. Initializing CMS...');
		} else {
			log.warn('⚠️  No configuration found!');
			log.info('');
			log.info('  Please run the setup wizard first:');
			log.info('  $ cd apps/setup && bun run dev');
			log.info('');
			log.info('  After setup completes, return here and run:');
			log.info('  $ cd apps/cms && bun run dev');
			log.info('');
		}
	}

	return {
		customLogger,
		plugins: [
			// Security check plugin runs first to detect private setting imports
			securityCheckPlugin({
				failOnError: true,
				showWarnings: true,
				extensions: ['.svelte', '.ts', '.js']
			}),
			sveltekit(),
			cmsWatcherPlugin(), // Always use watcher plugin (no setup mode)
			paraglideVitePlugin({
				project: './project.inlang',
				outdir: './src/paraglide'
			}),
			svelteEmailTailwind({
				pathToEmailFolder: './src/components/emails'
			})
		],

		server: {
			fs: { allow: ['static', '.', '../..'] },
			watch: {
				// Prevent watcher from triggering on generated/sensitive files
				ignored: [
					'**/config/private.ts',
					'**/config/private.backup.*.ts',
					'**/compiledCollections/**',
					'**/node_modules/**',
					'**/.git/**',
					'**/.svelte-kit/**',
					'**/build/**',
					'**/dist/**',
					'**/.nx/**',
					'**/logs/**',
					'**/mediaFolder/**'
				],
				// Use polling as fallback if native watching fails (prevents ENOSPC)
				usePolling: false,
				// Reduce watcher load
				interval: 1000,
				binaryInterval: 3000
			}
		},

		resolve: {
			alias: {
				'@root': path.resolve(__dirname, './'),
				'@src': path.resolve(__dirname, './src'),
				'@components': path.resolve(__dirname, './src/components'),
				'@content': path.resolve(__dirname, './src/content'),
				'@utils': path.resolve(__dirname, './src/utils'),
				'@stores': path.resolve(__dirname, './src/stores'),
				'@widgets': path.resolve(__dirname, './src/widgets')
			}
		},

		define: {
			__FRESH_INSTALL__: false, // Default, may be overridden by setupWizardPlugin
			// NOTE: PKG_VERSION is now provided by the server at runtime from package.json
			// This ensures version always reflects installed package, not build-time snapshot
			// SUPERFORMS_LEGACY: true, // Uncomment if using older versions of Superforms
			// `global` polyfill for libraries that expect it (e.g., older crypto libs)
			global: 'globalThis',
			// Path to compiled collections (workspace root relative)
			'import.meta.env.VITE_COLLECTIONS_FOLDER': JSON.stringify(paths.compiledCollections)
		},

		build: {
			target: 'esnext',
			minify: 'esbuild',
			sourcemap: true,
			chunkSizeWarningLimit: 600, // Increase from 500KB (after optimizations)
			rollupOptions: {
				onwarn(warning, warn) {
					// Suppress circular dependency warnings from third-party libraries
					// These are internal to the libraries and don't affect functionality
					if (warning.code === 'CIRCULAR_DEPENDENCY') {
						// Check all possible fields where the path might be
						const ids = warning.ids || [];
						const message = warning.message || '';

						// Combine all text to check
						const allText = [message, ...ids].join(' ');

						// If it contains node_modules, it's a third-party circular dependency - suppress it
						if (allText.includes('node_modules')) {
							return; // Suppress warnings from these specific packages
						}
					}

					// Suppress unused external import warnings
					if (warning.code === 'UNUSED_EXTERNAL_IMPORT') {
						return;
					}

					// Suppress eval warnings from Vite (common in dev dependencies)
					if (warning.code === 'EVAL' && warning.id?.includes('node_modules')) {
						return;
					}

					// Suppress "dynamic import will not move module" warnings for known patterns
					// This happens when a module is both statically and dynamically imported
					// It's intentional in our architecture (eager + lazy loading patterns)
					if (warning.message?.includes('dynamic import will not move module')) {
						const knownPatterns = ['widgetStore.svelte.ts', 'richText/Input.svelte'];
						if (knownPatterns.some((pattern) => warning.message?.includes(pattern))) {
							return; // Suppress these specific warnings
						}
					}

					// Show all other warnings
					warn(warning);
				},
				external: [...builtinModules, ...builtinModules.map((m) => `node:${m}`), 'typescript', 'ts-node'],
				output: {
					// Optimized chunking for better caching and smaller initial load
					manualChunks: (id: string) => {
						// Only split vendor libraries (node_modules)
						if (id.includes('node_modules')) {
							// Rich text editors (TipTap, ProseMirror) - usually large (~150KB)
							if (id.includes('tiptap') || id.includes('prosemirror')) {
								return 'vendor-editor';
							}

							// Code editor (CodeMirror) - large (~100KB)
							if (id.includes('codemirror') || id.includes('@codemirror')) {
								return 'vendor-codemirror';
							}

							// Chart/visualization libraries
							if (id.includes('chart') || id.includes('d3')) {
								return 'vendor-charts';
							}

							// MongoDB/Mongoose - server-side only, shouldn't be in client bundle
							if (id.includes('mongodb') || id.includes('mongoose')) {
								return 'vendor-db';
							}

							// Skeleton UI components
							if (id.includes('@skeletonlabs/skeleton')) {
								return 'skeleton-ui';
							}

							// Svelte ecosystem (including SvelteKit to avoid circular deps)
							if (id.includes('svelte')) {
								return 'vendor-svelte';
							}

							// Everything else (core utilities)
							return 'vendor';
						}

						// Route-based code splitting for admin vs public routes
						// This keeps admin-heavy features separate from public pages
						if (id.includes('src/routes/(app)/dashboard')) {
							return 'route-dashboard';
						}
						if (id.includes('src/routes/(app)/config')) {
							return 'route-admin-config';
						}

						if (id.includes('src/routes/(app)/mediagallery')) {
							return 'route-media';
						}

						// Let Vite handle other application code automatically
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
