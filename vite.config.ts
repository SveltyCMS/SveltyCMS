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

import { exec } from "node:child_process";
process.env.ESBUILD_WORKER_THREADS = "0";

import { existsSync, promises as fsPromises } from "node:fs";
import { builtinModules } from "node:module";
import { platform } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import { sveltekit } from "@sveltejs/kit/vite";
import { svelteInspector } from "@sveltejs/vite-plugin-svelte-inspector";
import tailwindcss from "@tailwindcss/vite";
import type { Plugin, ViteDevServer } from "vite";
import { defineConfig } from "vitest/config";
import { compile } from "./src/utils/compilation/compile.ts";
import { isSetupComplete } from "./src/utils/setup-check-fast.ts";
import { securityCheckPlugin } from "./src/utils/vite-plugin-security-check.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cross-platform open URL function (replaces 'open' package)
function openUrl(url: string) {
  const plat = platform();
  let cmd: string;
  if (plat === "win32") {
    cmd = `start "" "${url}"`;
  } else if (plat === "darwin") {
    cmd = `open "${url}"`;
  } else {
    cmd = `xdg-open "${url}"`;
  }
  exec(cmd);
}

function testBackdoorStripperPlugin(): Plugin {
  return {
    name: "test-backdoor-stripper",
    enforce: "pre",
    resolveId(id, importer, options) {
      // 1. FAST BYPASS: Most modules don't need stripping (Vite 8 optimization)
      if (
        !id.includes("testing") &&
        !id.includes("tiptap") &&
        !id.includes("prosemirror") &&
        !id.includes("handle-test-isolation")
      )
        return null;

      const normalizedId = id.replace(/\\/g, "/");

      if (options?.ssr) {
        if (
          id.includes("tiptap") ||
          id.includes("prosemirror") ||
          normalizedId.includes("tiptap") ||
          normalizedId.includes("prosemirror")
        ) {
          return `\0virtual:ssr-stub:${id}`;
        }
      }

      if (process.env.NODE_ENV === "production" && !process.env.TEST_MODE) {
        if (
          normalizedId.includes("src/routes/api/testing") ||
          normalizedId.includes("src/hooks/handle-test-isolation")
        ) {
          log.warn(`[Stripper] Physically removing test module from production build: ${id}`);
          return "\0virtual:test-noop";
        }
      }

      // Stub Tiptap and Prosemirror during SSR builds to prevent resolution errors
      if (options?.ssr) {
        if (
          id.startsWith("@tiptap/") ||
          id.startsWith("prosemirror-") ||
          id.includes("tiptap.client")
        ) {
          return `\0virtual:ssr-stub:${id}`;
        }
      }

      return null;
    },
    load(id) {
      if (id === "\0virtual:test-noop") {
        // Return a safe no-op for the stripper
        return 'export const POST = () => new Response("Not Found", { status: 404 }); export const handleTestIsolation = ({ event, resolve }) => resolve(event); export default {};';
      }

      if (id.startsWith("\0virtual:ssr-stub:")) {
        // Return a proxy-based no-op for SSR stubs to handle any named export
        return `
					export const createEditor = () => ({});
					export const Editor = class {};
					export const Extension = { create: () => ({}) };
					const noop = () => ({});
					const proxy = new Proxy({}, { get: () => noop });
					export default proxy;
					export const Image = noop;
					export const TextStyle = noop;
					export const StarterKit = noop;
					export const Table = noop;
					export const TableRow = noop;
					export const TableHeader = noop;
					export const TableCell = noop;
					export const TextAlign = noop;
					export const Underline = noop;
					export const Youtube = noop;
					export const CharacterCount = noop;
					export const Color = noop;
					export const FontFamily = noop;
					export const Link = noop;
					export const Placeholder = noop;
				`;
      }

      return null;
    },
  };
}

/**
 * Plugin to alias @config/private to config/private.test.ts when running in TEST_MODE.
 * This allows local tests to use an isolated configuration without modifying the production config.
 */
function testConfigAliasPlugin(): Plugin {
  // Optimization: NO-OP if not in TEST_MODE, avoiding resolveId overhead
  if (process.env.TEST_MODE !== "true") {
    return { name: "test-config-alias" };
  }

  return {
    name: "test-config-alias",
    enforce: "pre",
    resolveId(id) {
      // Check for direct import or alias
      if (id === "@config/private" || id.endsWith("config/private.ts")) {
        const cwd = process.cwd();
        const testConfigPath = path.resolve(cwd, "config/private.test.ts");
        // Only alias if the test config actually exists
        if (existsSync(testConfigPath)) {
          log.info("Test Mode: Aliasing @config/private to config/private.test.ts");
          return testConfigPath;
        }
      }
    },
  };
}

/**
 * Plugin that provides a fallback for @config/private and @config/private.test when the file doesn't exist
 * This allows builds to succeed in fresh clones without committing sensitive credentials
 */
function privateConfigFallbackPlugin(): Plugin {
  const virtualModuleId = "@config/private";
  const virtualTestModuleId = "@config/private.test";
  const resolvedVirtualModuleId = `\0${virtualModuleId}`;
  const resolvedVirtualTestModuleId = `\0${virtualTestModuleId}`;

  // Cache resolution results to avoid repeated filesystem checks (Rolldown optimization)
  const resolutionCache = new Map<string, string | null>();

  return {
    name: "private-config-fallback",
    enforce: "pre",
    resolveId(id) {
      // 1. Aggressive Early Exit: Check keywords FIRST before any logic
      if (!id.includes("config/private") && id !== virtualModuleId && id !== virtualTestModuleId)
        return null;

      // 2. Cache check
      if (resolutionCache.has(id)) return resolutionCache.get(id);

      if (id === virtualModuleId) return resolvedVirtualModuleId;
      if (id === virtualTestModuleId) return resolvedVirtualTestModuleId;

      const cwd = process.cwd();
      const normalizedId = id.replace(/\\/g, "/");
      let result: string | null = null;

      // Check for production config
      if (normalizedId.endsWith("config/private") || normalizedId.endsWith("config/private.ts")) {
        const prodPath = path.resolve(cwd, "config/private.ts");
        result = existsSync(prodPath) ? null : resolvedVirtualModuleId;
      }
      // Check for test config
      else if (
        normalizedId.endsWith("config/private.test") ||
        normalizedId.endsWith("config/private.test.ts")
      ) {
        const testPath = path.resolve(cwd, "config/private.test.ts");
        result = existsSync(testPath) ? null : resolvedVirtualTestModuleId;
      }

      resolutionCache.set(id, result);
      return result;
    },
    load(id) {
      if (id === resolvedVirtualModuleId || id === resolvedVirtualTestModuleId) {
        // Provide fallback that reads from environment variables
        return `
export const privateEnv = {
	DB_TYPE: process.env.DB_TYPE || '',
	DB_HOST: process.env.DB_HOST || '127.0.0.1',
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
    },
  };
}

// --- Constants & Configuration ---
const CWD = process.cwd();
const paths = {
  configDir: path.resolve(CWD, "config"),
  privateConfig: path.resolve(CWD, "config/private.ts"),
  userCollections: path.resolve(CWD, process.env.COLLECTIONS_DIR || "config/collections"),
  compiledCollections: path.resolve(
    CWD,
    process.env.COMPILED_COLLECTIONS_DIR || ".compiledCollections",
  ),
  widgets: path.resolve(CWD, "src/widgets"),
};

// --- Utilities ---
const useColor = process.stdout.isTTY;

// Standardized logger for build-time scripts, mimicking the main application logger's style.
// Colored tag printed once so message-local color codes render correctly.
const TAG = useColor ? "\x1b[34m[SveltyCMS]\x1b[0m" : "[SveltyCMS]";

const log = {
  // Info level — tag is blue, message follows (may contain its own color codes)
  info: (message: string) => console.log(`${TAG} ℹ️ [INFO ] ${message}`),
  // Custom success level for clarity in build process
  success: (message: string) =>
    console.log(
      `${TAG} ${useColor ? `✅ \x1b[32m[SUCCESS] ${message}\x1b[0m` : `✅ [SUCCESS] ${message}`}`,
    ),
  // Corresponds to 'warn' level
  warn: (message: string) =>
    console.warn(
      `${TAG} ${useColor ? `⚠️ \x1b[33m[WARN ] ${message}\x1b[0m` : `⚠️ [WARN ] ${message}`}`,
    ),
  // Corresponds to 'error' level
  error: (message: string, error?: unknown) =>
    console.error(
      `${TAG} ${useColor ? `❌ \x1b[31m[ERROR] ${message}\x1b[0m` : `❌ [ERROR] ${message}`}`,
      error ?? "",
    ),
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

  await fsPromises.mkdir(paths.userCollections, { recursive: true });
  await fsPromises.mkdir(paths.compiledCollections, { recursive: true });

  const sourceFiles = (await fsPromises.readdir(paths.userCollections, { recursive: true })).filter(
    (file): file is string =>
      typeof file === "string" && (file.endsWith(".ts") || file.endsWith(".js")),
  );

  if (sourceFiles.length > 0) {
    if (process.env.BENCHMARK_DEBUG === "true") {
      log.info(`Found \x1b[32m${sourceFiles.length}\x1b[0m collection(s), compiling...`);
    }
    await compile({
      userCollections: paths.userCollections,
      compiledCollections: paths.compiledCollections,
    });
    if (process.env.BENCHMARK_DEBUG === "true") {
      log.success("Initial collection compilation successful!");
    }
  }
}

// Force exit on SIGINT to prevent hanging processes
process.on("SIGINT", () => {
  log.warn("\nReceived SIGINT, forcing exit...");
  process.exit(0);
});

// --- Vite Plugins ---

/**
 * Plugin to suppress noisy third-party warnings during build
 */
function suppressThirdPartyWarningsPlugin(): Plugin {
  let originalConsoleWarn: typeof console.warn | undefined;
  let isIntercepted = false;
  const warningPatterns = [
    /Circular dependency:.*node_modules/,
    /".*" is imported from external module ".*" but never used/,
    /".*" is imported by ".*", but could not be resolved – treating it as an external dependency/,
  ];

  return {
    name: "suppress-third-party-warnings",
    buildStart() {
      if (!isIntercepted) {
        isIntercepted = true;
        originalConsoleWarn = console.warn;
        console.warn = (...args: unknown[]) => {
          const message = typeof args[0] === "string" ? args[0] : String(args[0] ?? "");
          // Explicitly ignore circular dependency warnings for the build page/status components
          if (
            message.includes("Circular dependency") &&
            (message.includes("status") || message.includes("build"))
          ) {
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
    },
  };
}

function stubServerModulesPlugin(): Plugin {
  // Pre-compiled regex for high-performance pattern matching (Vite 8 / Rolldown optimization)
  const serverOnlyRegex =
    /\.(server\.|mongodb|mariadb|postgresql|sqlite|redis|argon2|mongoose|better-sqlite3|mysql2|pg|aws-sdk|googleapis)/i;

  // Directories/files that must NEVER appear in the client bundle.
  const serverOnlyFiles = new Set([
    "/src/databases/db.ts",
    "/src/databases/database-resilience.ts",
    "/src/databases/cache/cache-service.ts",
    "/src/databases/cache-warming-service.ts",
    "/src/databases/cache-metrics.ts",
    "/src/databases/config-state.ts",
    "/src/databases/webhook-wrapper.ts",
    "/src/databases/theme-manager.ts",
    "/src/databases/db-adapter-wrapper.ts",
    "/src/databases/db-utils.ts",
    "/src/databases/schemas.ts",
    "/src/databases/auth/index.ts",
    "/src/databases/auth/session-cleanup.ts",
    "/src/databases/auth/session-manager.ts",
    "/src/databases/auth/two-factor-auth.ts",
    "/src/databases/auth/permissions.ts",
    "/src/databases/cache/redis-store.ts",
    "/src/databases/cache/inmemory-store.ts",
    "/src/content/content-service.server.ts",
    "/src/content/content-watcher.server.ts",
    "/src/content/module-processor.server.ts",
    "/src/components/emails/",
  ]);

  return {
    name: "stub-server-modules",
    enforce: "pre",
    load(id, options) {
      // 1. Fast-path: Skip stubbing for SSR or Unit Tests
      if (options?.ssr || process.env.TEST_MODE === "true") return null;

      // 2. Optimization: If the ID doesn't contain a dot or slash, it's likely not a file path we care about
      if (!id.includes(".") && !id.includes("/") && !id.includes("\\")) return null;

      // 3. Regex check (High-performance combined pattern matching)
      if (serverOnlyRegex.test(id)) {
        return `export default {}; export const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };`;
      }

      // 4. File-based check
      const normalizedId = id.replace(/\\/g, "/");
      if (serverOnlyFiles.has(normalizedId)) {
        return `export default {};
export const getPrivateSettingSync = () => ({});
export const getPrivateSetting = async () => ({});
export const getPublicSettingSync = () => ({});
export const getPublicSetting = async () => ({});
export const getUntypedSetting = async () => ({});
export const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };`;
      }

      return null;
    },
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
    const isCollectionFile =
      absoluteFile.startsWith(paths.userCollections) && /\.(ts|js)$/.test(file);
    const isWidgetFile =
      absoluteFile.startsWith(paths.widgets) &&
      (file.endsWith("index.ts") || file.endsWith(".svelte"));
    const isPrivateConfig = absoluteFile === paths.privateConfig;

    // ✨ SETUP COMPLETION DETECTION
    if (isPrivateConfig) {
      log.info(
        "\x1b[32mconfig/private.ts detected!\x1b[0m Notifying client and triggering restart...",
      );
      // Send custom event to the browser to show a "System Starting" overlay
      server.ws.send("svelty:setup-complete", {
        timestamp: Date.now(),
        message: "System initialized. Restarting...",
      });

      // Force a full reload after a short delay to let the file settle
      setTimeout(() => {
        server.ws.send({ type: "full-reload", path: "*" });
      }, 500);
      return;
    }

    if (isCollectionFile) {
      clearTimeout(compileTimeout);
      compileTimeout = setTimeout(async () => {
        log.info("Collection change detected. Recompiling...");
        try {
          await compile({
            userCollections: paths.userCollections,
            compiledCollections: paths.compiledCollections,
            targetFile: file,
          });
          log.success(`Re-compilation successful for ${path.basename(file)}!`);

          // Register collection models in database after recompilation
          // Only attempt this if setup is complete
          if (isSetupComplete()) {
            try {
              const { dbAdapter } = await server.ssrLoadModule(
                path.join(CWD, "src/databases/db.ts"),
              );
              if (dbAdapter?.collection) {
                const { scanCompiledCollections } = await server.ssrLoadModule(
                  path.join(CWD, "src/content/content-reconciler/scan-files.server.ts"),
                );
                const collections = await scanCompiledCollections();
                log.info(`Found ${collections.length} collections, registering models...`);

                for (const schema of collections) {
                  await dbAdapter.collection.createModel(schema);
                  await new Promise((resolve) => setTimeout(resolve, 50));
                }
                log.success(`Collection models registered! (${collections.length} total)`);
              }
            } catch (dbError) {
              log.error("Failed to register collection models (non-fatal):", dbError);
            }
          }

          const { generateContentTypes } = await server.ssrLoadModule(
            path.join(CWD, "src/content/vite.ts"),
          );
          await generateContentTypes(server);
          server.ws.send({ type: "full-reload", path: "*" });
        } catch (error) {
          log.error("Error recompiling collections:", error);
        }
      }, 150);
    }

    if (isWidgetFile) {
      clearTimeout(widgetTimeout);
      widgetTimeout = setTimeout(async () => {
        log.info("Widget file change detected. Reloading widget store...");
        try {
          const { widgetStoreActions } = await server.ssrLoadModule(
            path.join(CWD, "src/stores/widget-store.svelte.ts"),
          );
          await widgetStoreActions.reload();
          server.ws.send({ type: "full-reload", path: "*" });
          log.success("Widgets reloaded and client updated.");
        } catch (err) {
          log.error("Error reloading widgets:", err);
        }
      }, 150);
    }
  };

  return {
    name: "svelty-cms-main",
    async buildStart() {
      wasPrivateConfigMissing = !existsSync(paths.privateConfig);
      if (wasPrivateConfigMissing) {
        await fsPromises.mkdir(paths.configDir, { recursive: true });
      }
      await initializeCollectionsStructure();
    },
    config: () => ({
      define: {
        __FRESH_INSTALL__: JSON.stringify(wasPrivateConfigMissing),
        __SVELTY_SETUP_COMPLETE__: JSON.stringify(!wasPrivateConfigMissing),
      },
    }),
    configureServer(server) {
      // Watch for changes regardless of setup status
      server.watcher.on("all", (event, file) => {
        if (event === "add" || event === "change" || event === "unlink") {
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
              const resolvedPort = typeof address === "object" && address ? address.port : 5173;
              const setupUrl = `http://127.0.0.1:${resolvedPort}/setup`;
              openUrl(setupUrl);
            }, 1000);
          });
          return result;
        };
      }
    },
  };
}

/**
 * Plugin to capture build metadata (time, module counts) for analytics.
 * Writes to .svelte-kit/output/build-metadata-{client|server}.json
 */
function buildMetadataPlugin(): Plugin {
  let startTime: number;
  let isSSR = false;
  const outputPath = path.resolve(CWD, ".svelte-kit/output");

  return {
    name: "svelty-cms-build-metadata",
    apply: "build", // Only run during build
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
        await fsPromises.mkdir(outputPath, { recursive: true });
      }

      const metadata = {
        timestamp: new Date().toISOString(),
        type: isSSR ? "server" : "client",
        duration,
        moduleCount,
      };

      const filename = `build-metadata-${isSSR ? "server" : "client"}.json`;
      await fsPromises.writeFile(
        path.resolve(outputPath, filename),
        JSON.stringify(metadata, null, 2),
      );

      // Log explicitly to console for immediate visibility
      const color = isSSR ? "\x1b[36m" : "\x1b[32m"; // Cyan for server, Green for client
      const reset = "\x1b[0m";
      console.log(
        `${TAG} ${color}${isSSR ? "Server" : "Client"} build completed in ${duration.toFixed(2)}ms (${moduleCount} chunks/assets)${reset}`,
      );
    },
  };
}

// --- Main Vite Configuration ---
const setupComplete = isSetupComplete();
const isBuild = process.env.NODE_ENV === "production" || process.argv.includes("build");

export default defineConfig((): any => {
  // Only log during dev mode, not during builds
  if (!isBuild) {
    if (setupComplete) {
      if (process.env.BENCHMARK_DEBUG === "true") {
        log.success("Setup check passed. Initializing full dev environment...");
      }
    }
  }

  return {
    plugins: [
      testBackdoorStripperPlugin(),
      testConfigAliasPlugin(),
      privateConfigFallbackPlugin(),
      stubServerModulesPlugin(),
      sveltekit(),
      svelteInspector(),
      sveltyCmsPlugin(),
      securityCheckPlugin(),
      suppressThirdPartyWarningsPlugin(),
      buildMetadataPlugin(),
      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/paraglide",
      }),
      tailwindcss(),
    ].filter(Boolean),

    server: {
      fs: {
        allow: ["static", "."],
        deny: ["**/tests/**"],
      },
      watch: {
        // Prevent watcher from triggering on generated/sensitive files
        ignored: [
          "**/config/private.ts",
          "**/config/private.test.ts",
          "**/config/private.backup.*.ts",
          "**/.compiledCollections/**",
          "**/tests/**",
          "**/src/content/types.ts",
          "**/src/paraglide/**",
          "**/logs/**",
          "**/mediaFolder/**",
        ],
      },
    },
    ssr: {
      noExternal: [
        "@skeletonlabs/skeleton-svelte",
        "@iconify/svelte",
        "svelte-canvas",
        "svelte-dnd-action",
        "svelte-awesome-color-picker",
        "json-render-svelte",
      ],
      external: [
        "bun:sqlite",
        "bun:test",
        "redis",
        "better-sqlite3",
        "mongoose",
        "postgres",
        "mysql2",
      ],
    },
    resolve: {
      alias: [
        { find: "@root", replacement: path.resolve(CWD, "./") },
        { find: "@src", replacement: path.resolve(CWD, "./src") },
        {
          find: "@components",
          replacement: path.resolve(CWD, "./src/components"),
        },
        { find: "@content", replacement: path.resolve(CWD, "./src/content") },
        {
          find: "@databases",
          replacement: path.resolve(CWD, "./src/databases"),
        },
        { find: "@config", replacement: path.resolve(CWD, "config") },
        { find: "@utils", replacement: path.resolve(CWD, "./src/utils") },
        { find: "@stores", replacement: path.resolve(CWD, "./src/stores") },
        { find: "@widgets", replacement: path.resolve(CWD, "./src/widgets") },
      ],
    },
    define: {
      __FRESH_INSTALL__: false, // Default, may be overridden by setupWizardPlugin
      __SVELTY_SETUP_COMPLETE__: setupComplete,
      global: "globalThis", // `global` polyfill for libraries that expect it (e.g., older crypto libs)
      "import.meta.env.VITE_LOG_LEVELS": JSON.stringify(
        process.env.LOG_LEVELS || (isBuild ? "info,warn,error" : "info,warn,error,debug"),
      ),
    },
    build: {
      target: "esnext",
      minify: "esbuild",
      sourcemap: true,
      chunkSizeWarningLimit: 600, // Increase from 500KB (after optimizations)
      rollupOptions: {
        // Tree-shaking with preserved side effects for critical packages
        treeshake: {
          // Preserve side-effect imports for packages that need them
          moduleSideEffects: (id: string) => {
            // These packages have important side effects that must not be removed
            if (id.includes("paraglide") || id.includes("iconify-icon")) {
              return true;
            }
            // Default: assume no side effects for other modules
            return false;
          },
          propertyReadSideEffects: false, // Allow property reads to be removed
        },
        output: {
          manualChunks: (id: string) => {
            // Group Svelte internal modules to avoid circular dependencies between chunks.
            // Server-only packages (mongoose, @aws-sdk, googleapis, etc.) are now
            // stubbed by stubServerModulesPlugin and should never reach the client.
            if (id.includes("node_modules/svelte")) {
              return "vendor-svelte";
            }
            if (id.includes("node_modules/@tiptap") || id.includes("node_modules/prosemirror")) {
              return "vendor-editor";
            }
          },
        },
        onwarn(warning: any, warn: any) {
          // Suppress circular dependency warnings from third-party libraries
          if (warning.code === "CIRCULAR_DEPENDENCY" && warning.message.includes("node_modules")) {
            return;
          }
          // Suppress unused external import warnings
          if (warning.code === "UNUSED_EXTERNAL_IMPORT") {
            return;
          }
          // Suppress eval warnings from Vite (common in dev dependencies)
          if (warning.code === "EVAL" && warning.id?.includes("node_modules")) {
            return;
          }
          // Suppress "dynamic import will not move module" warnings for specific files where this is intentional.
          // See /docs/architecture/state-management.mdx for details.
          if (warning.message?.includes("dynamic import will not move module")) {
            const isWidgetStore = warning.id?.includes("widget-store.svelte.ts");
            const isStateStore = warning.id?.includes("state.svelte.ts");
            const isRichTextInput = warning.id?.includes("rich-text/input.svelte");
            const isSettingsService = warning.id?.includes("services/settings-service.ts");
            const isDb = warning.id?.includes("databases/db.ts");
            if (isWidgetStore || isStateStore || isRichTextInput || isSettingsService || isDb) {
              return;
            }
          }
          // Show all other warnings
          warn(warning);
        },
        external: [
          ...builtinModules,
          ...builtinModules.map((m) => `node:${m}`),
          "typescript",
          "ts-node",
          "better-sqlite3",
          "mongoose",
          "postgres",
          "mysql2",
          "redis",
        ],
      },
    },
    optimizeDeps: {
      exclude: [
        ...builtinModules,
        ...builtinModules.map((m) => `node:${m}`),
        "redis",
        "@src/databases/cache/cache-service",
      ],
      include: [
        "@skeletonlabs/skeleton-svelte",
        "@iconify/svelte",
        "svelte-canvas",
        "svelte-dnd-action",
        "svelte-awesome-color-picker",
        "json-render-svelte",
        "valibot",
        "drizzle-orm",
      ],
      entries: ["!tests/**/*", "!**/*.server.ts", "!**/*.server.js"],
    },
  };
});
