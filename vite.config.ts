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

// ── Silently suppress AWS SDK / Smithy Rollup chunk-split noise in adapter builds ──
const _origStderrWrite = process.stderr.write.bind(process.stderr);
process.stderr.write = (chunk: any, ...rest: any[]): boolean => {
  const msg = typeof chunk === "string" ? chunk : (chunk?.toString() ?? "");
  if (
    msg.includes("will end up in different chunks") &&
    (msg.includes("@smithy") || msg.includes("@aws-sdk"))
  )
    return true;
  return _origStderrWrite(chunk, ...rest);
};

import { exec } from "node:child_process";
process.env.ESBUILD_WORKER_THREADS = "0";

import { existsSync, readFileSync, promises as fsPromises } from "node:fs";
import { builtinModules } from "node:module";
import { platform } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import adapter from "svelte-adapter-uws";
import uws from "svelte-adapter-uws/vite";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";
import realtime from "svelte-realtime/vite";
import { paraglideVitePlugin } from "@inlang/paraglide-js";
import type { Plugin, ViteDevServer } from "vite";
import { defineConfig } from "vitest/config";
import { isSetupComplete } from "./src/utils/setup-check-fast";
import { securityCheckPlugin } from "./src/utils/vite-plugin-security-check";

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
      // 1. Ultra-fast bypass (Rolldown optimization)
      if (!id.includes("/") && !id.includes("\\")) return null;

      const norm = id.replace(/\\/g, "/");

      // 2. SSR Stubbing (Performance: only check if SSR is active)
      if (options?.ssr && (norm.includes("tiptap") || norm.includes("prosemirror"))) {
        return `\0virtual:ssr-stub:${id}`;
      }

      // 3. Production Test Backdoor Removal
      if (process.env.NODE_ENV === "production" && !process.env.TEST_MODE) {
        if (
          norm.includes("src/routes/api/testing") ||
          norm.includes("src/hooks/handle-test-isolation")
        ) {
          return "\0virtual:test-noop";
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
  themes: path.resolve(CWD, "src/themes"),
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

  // Ensure themes directory exists
  await fsPromises.mkdir(paths.themes, { recursive: true });

  const sourceFiles = (await fsPromises.readdir(paths.userCollections, { recursive: true })).filter(
    (file): file is string =>
      typeof file === "string" && (file.endsWith(".ts") || file.endsWith(".js")),
  );

  if (sourceFiles.length > 0) {
    if (process.env.BENCHMARK_DEBUG === "true") {
      log.info(`Found \x1b[32m${sourceFiles.length}\x1b[0m collection(s), compiling...`);
    }
    const { compile } = await import("./src/utils/compilation/compile");
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
  let originalConsoleLog: typeof console.log | undefined;
  let originalStderrWrite: typeof process.stderr.write | undefined;
  let originalStdoutWrite: typeof process.stdout.write | undefined;
  let isIntercepted = false;
  const warningPatterns = [
    /Circular dependency:.*node_modules/,
    /".*" is imported from external module ".*" but never used/,
    /".*" is imported by ".*", but could not be resolved – treating it as an external dependency/,
    // AWS SDK / Smithy chunk-split noise (adapter Rollup, not our code)
    /will end up in different chunks.*@smithy/,
    /will end up in different chunks.*@aws-sdk/,
    // svelte-realtime startup noise (utility exports not meant for live())
    /\[svelte-realtime\]/,
    // Suppress sourcemap warnings from plugins that don't generate them
    /\[SOURCEMAP_BROKEN\]/,
    // Suppress "Module X has been externalized for browser compatibility" (informational, not an error)
    /has been externalized for browser compatibility/,
    // Suppress empty glob pattern warnings from dynamic imports with variable segments
    /did not match any files/,
  ];

  function shouldSuppress(msg: string): boolean {
    return warningPatterns.some((pattern) => pattern.test(msg));
  }

  return {
    name: "suppress-third-party-warnings",
    buildStart() {
      if (!isIntercepted) {
        isIntercepted = true;
        originalConsoleWarn = console.warn;
        originalConsoleLog = console.log;
        originalStderrWrite = process.stderr.write.bind(process.stderr);
        originalStdoutWrite = process.stdout.write.bind(process.stdout);
        console.warn = (...args: unknown[]) => {
          const msg = typeof args[0] === "string" ? args[0] : String(args[0] ?? "");
          if (shouldSuppress(msg)) return;
          (originalConsoleWarn as typeof console.warn).apply(console, args);
        };
        console.log = (...args: unknown[]) => {
          const msg = typeof args[0] === "string" ? args[0] : String(args[0] ?? "");
          if (shouldSuppress(msg)) return;
          (originalConsoleLog as typeof console.log).apply(console, args);
        };
        process.stderr.write = (chunk: any, ...rest: any[]): boolean => {
          const msg = typeof chunk === "string" ? chunk : (chunk?.toString() ?? "");
          if (shouldSuppress(msg)) return true;
          return originalStderrWrite!(chunk, ...rest);
        };
        process.stdout.write = (chunk: any, ...rest: any[]): boolean => {
          const msg = typeof chunk === "string" ? chunk : (chunk?.toString() ?? "");
          if (shouldSuppress(msg)) return true;
          return originalStdoutWrite!(chunk, ...rest);
        };
      }
    },
    closeBundle() {
      if (originalConsoleWarn) console.warn = originalConsoleWarn;
      if (originalConsoleLog) console.log = originalConsoleLog;
      if (originalStderrWrite) process.stderr.write = originalStderrWrite;
      if (originalStdoutWrite) process.stdout.write = originalStdoutWrite;
      isIntercepted = false;
    },
  };
}

function stubServerModulesPlugin(): Plugin {
  // Pre-compiled regex for high-performance pattern matching (Vite 8 / Rolldown optimization)
  const serverOnlyRegex =
    /\.(server\.|mongodb|mariadb|postgresql|sqlite|redis|argon2|mongoose|mysql2|pg|aws-sdk|googleapis)/i;

  const serverOnlyPackages = [
    "argon2",
    "redis",
    "mongoose",
    "mongodb",
    "postgres",
    "mysql2",
    "bun:sqlite",
    "node-os-utils",
  ];

  // Directories/files that must NEVER appear in the client bundle.
  const serverOnlyFiles = new Set([
    "/src/databases/db.ts",
    "/src/databases/database-resilience.ts",
    "/src/databases/cache/cache-service.ts",
    "/src/databases/cache/cache-warming-service.ts",
    "/src/databases/cache/cache-metrics.ts",
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
    "/src/content/engine.server.ts",
    "/src/content/engine.server.ts",
    "/src/content/loader.server.ts",
    "/src/components/emails/",
    "/src/services/security/audit-service.ts",
    "/src/databases/sqlite/adapter-core.ts",
  ]);

  return {
    name: "stub-server-modules",
    enforce: "pre",
    resolveId(id, importer, options) {
      if (options?.ssr || process.env.TEST_MODE === "true") return null;

      if (serverOnlyPackages.includes(id)) {
        return `\0virtual:stub:${id}`;
      }

      // Also stub individual server-only files to suppress Node builtin warnings
      const normalizedId = id.replace(/\\/g, "/");
      const isServerOnlyFile = [...serverOnlyFiles].some((f) => normalizedId.endsWith(f));
      if (isServerOnlyFile) {
        return `\0virtual:stub:${id}`;
      }

      return null;
    },
    load(id, options) {
      if (id.startsWith("\0virtual:stub:")) {
        return `export default {};
export const Database = class {};
export const Schema = { Types: {} };
export const Model = {};
export const Connection = {};
export const Document = {};
export const Types = { ObjectId: String };
export const QueryFilter = {};
export const createPool = () => ({ end: () => {}, promise: () => ({ query: async () => [[]], execute: async () => [[]] }) });
export const createConnection = () => ({ end: () => {}, query: async () => [] });
export const Pool = class { end() {}; connect() { return { query: async () => ({ rows: [] }), release: () => {} }; } };
export const Client = class { connect() {}; end() {}; query = async () => ({ rows: [] }) };
export const MongoClient = { connect: async () => ({ db: () => ({ collection: () => ({ find: () => ({ toArray: async () => [] }) }) }), close: () => {} }) };
export const ObjectId = String;
export const createClient = () => ({ connect: async () => {}, disconnect: async () => {}, get: async () => null, set: async () => {}, del: async () => {} });
export const logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
export const verify = async () => false;
export const hash = async () => "";
export const needsRehash = () => false;
`;
      }

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

  const handleHmr = async (server: ViteDevServer, file: string, event: string = "change") => {
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
          const { compile } = await import("./src/utils/compilation/compile");
          await compile({
            userCollections: paths.userCollections,
            compiledCollections: paths.compiledCollections,
            targetFile: file,
            // On file deletion, skip targetFile so orphan cleanup runs
            ...(event === "unlink" ? { targetFile: undefined } : {}),
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
                  path.join(CWD, "src/content/engine.server.ts"),
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
            path.join(CWD, "scripts/generate-content-types.ts"),
          );
          await generateContentTypes(server);
          // Send targeted content-structure update instead of full-reload
          // to avoid breaking mongoose models and active sessions.
          server.ws.send("svelty:content-update", {
            timestamp: Date.now(),
          });
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

    // 🎨 THEME FILE SYNC: /src/themes/*.json → DB auto-import (shared with boot-time scan)
    const isThemeFile = absoluteFile.startsWith(paths.themes) && file.endsWith(".json");
    if (isThemeFile) {
      setTimeout(async () => {
        log.info(`Theme file detected: ${path.basename(file)}. Syncing to database...`);
        try {
          const { syncThemeFile } = await server.ssrLoadModule(
            path.join(CWD, "src/services/core/theme-file-sync.ts"),
          );
          const result = await syncThemeFile(file);
          if (result.action === "error") {
            log.error(`Failed to sync theme file ${result.file}: ${result.error}`);
            return;
          }
          if (result.action === "created" || result.action === "updated") {
            log.success(`Theme "${result.name}" ${result.action} from file.`);
          }
          server.ws.send("svelty:theme-update", {
            name: result.name,
            timestamp: Date.now(),
          });
        } catch (err) {
          log.error(`Failed to sync theme file ${path.basename(file)}:`, err);
        }
      }, 200);
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
          handleHmr(server, file, event);
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
function databaseAdapterStripperPlugin(): Plugin {
  // Only strip adapters in production build and when setup is complete
  const isBuild = process.env.NODE_ENV === "production" || process.argv.includes("build");
  const isTest = process.env.TEST_MODE === "true" || process.env.VITEST === "true";
  const setupComplete = isSetupComplete();
  const compileAll = process.env.COMPILE_ALL_ADAPTERS === "true";

  if (!isBuild || isTest || !setupComplete || compileAll) {
    return { name: "database-adapter-stripper" };
  }

  // 1. Determine the active database type
  let activeDbType = process.env.DATABASE_ENGINE || process.env.DB_TYPE;
  if (!activeDbType) {
    try {
      const privateConfigPath = path.resolve(process.cwd(), "config/private.ts");
      if (existsSync(privateConfigPath)) {
        const content = readFileSync(privateConfigPath, "utf-8");
        const match = content.match(/DB_TYPE\s*:\s*['"`](.*?)['"`]/);
        if (match) {
          activeDbType = match[1];
        }
      }
    } catch {
      // Ignore reading error
    }
  }

  const dbType = activeDbType?.toLowerCase() || "sqlite";

  log.info(`Active DB Type for Stripper: \x1b[32m${dbType}\x1b[0m`);

  return {
    name: "database-adapter-stripper",
    enforce: "pre",
    async resolveId(id, importer) {
      if (!importer) return null;

      // Only resolve paths inside our databases folder to avoid resolving every node_module
      if (
        !id.includes("databases") &&
        !id.startsWith(".") &&
        !id.startsWith("@databases") &&
        !id.startsWith("@src")
      ) {
        return null;
      }

      const resolved = await this.resolve(id, importer, { skipSelf: true });
      if (!resolved) return null;

      const normalizedId = resolved.id.replace(/\\/g, "/");

      if (dbType !== "sqlite" && normalizedId.endsWith("src/databases/sqlite/sqlite-adapter.ts")) {
        return "\0virtual:db-stub:sqlite";
      }
      if (dbType !== "sqlite" && normalizedId.endsWith("src/databases/sqlite/migrations.ts")) {
        return "\0virtual:db-stub:sqlite-migrations";
      }
      if (
        dbType !== "postgresql" &&
        normalizedId.endsWith("src/databases/postgresql/postgres-adapter.ts")
      ) {
        return "\0virtual:db-stub:postgresql";
      }
      if (
        dbType !== "mariadb" &&
        normalizedId.endsWith("src/databases/mariadb/mariadb-adapter.ts")
      ) {
        return "\0virtual:db-stub:mariadb";
      }
      if (
        dbType !== "mongodb" &&
        normalizedId.endsWith("src/databases/mongodb/mongo-db-adapter.ts")
      ) {
        return "\0virtual:db-stub:mongodb";
      }
      return null;
    },
    load(id) {
      if (id === "\0virtual:db-stub:sqlite") {
        return `export class SQLiteAdapter { constructor() { throw new Error("SQLite adapter is disabled in this build configuration."); } }`;
      }
      if (id === "\0virtual:db-stub:sqlite-migrations") {
        return `export async function runMigrations() { return { success: true }; }`;
      }
      if (id === "\0virtual:db-stub:postgresql") {
        return `export class PostgreSQLAdapter { constructor() { throw new Error("PostgreSQL adapter is disabled in this build configuration."); } }`;
      }
      if (id === "\0virtual:db-stub:mariadb") {
        return `export class MariaDBAdapter { constructor() { throw new Error("MariaDB adapter is disabled in this build configuration."); } }`;
      }
      if (id === "\0virtual:db-stub:mongodb") {
        return `export class MongoDBAdapter { constructor() { throw new Error("MongoDB adapter is disabled in this build configuration."); } }`;
      }
      return null;
    },
  };
}

function browserShimsPlugin(): Plugin {
  return {
    name: "browser-shims-plugin",
    enforce: "pre",
    resolveId(id, importer, options) {
      if (options?.ssr) {
        return null;
      }
      if (id === "fs" || id === "node:fs" || id === "fs/promises" || id === "node:fs/promises") {
        return path.resolve(CWD, "./src/utils/fs-mock.ts");
      }
      if (id === "path" || id === "node:path") {
        return path.resolve(CWD, "./src/utils/path-mock.ts");
      }
      if (id === "async_hooks" || id === "node:async_hooks") {
        return path.resolve(CWD, "./src/utils/fs-mock.ts");
      }
      return null;
    },
  };
}

/**
 * Patches vite-plus client module to inject Svelte Inspector.
 * The built-in inspector only matches `vite/dist/client/client.mjs`,
 * but vite-plus serves its client from `@voidzero-dev/vite-plus-core/dist/vite/client/client.mjs`.
 * This plugin uses a broad match to catch all vite-plus client variants.
 */
function vitePlusInspectorPatchPlugin(): Plugin {
  return {
    name: "vite-plus-inspector-patch",
    apply: "serve",
    enforce: "post",
    transform(code, id) {
      // Match both vite-plus re-export and the actual core client module
      if (
        (id.includes("vite-plus") || id.includes("vite-plus-core")) &&
        id.includes("client.mjs")
      ) {
        return {
          code: `${code}\nimport('virtual:svelte-inspector-path:load-inspector.js')`,
        };
      }
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
      uws(),
      databaseAdapterStripperPlugin(),
      testBackdoorStripperPlugin(),
      testConfigAliasPlugin(),
      privateConfigFallbackPlugin(),
      stubServerModulesPlugin(),
      browserShimsPlugin(),
      sveltekit({
        preprocess: [vitePreprocess()],
        compilerOptions: {
          runes: true,
          experimental: {
            async: true,
          },
        },
        vitePlugin: {
          inspector: {
            toggleKeyCombo: "meta-shift",
            holdMode: false,
            showToggleButton: "always",
            toggleButtonPos: "bottom-right",
          },
        },
        adapter: adapter({
          out: "build",
          precompress: true,
          envPrefix: "",
          websocket: true,
        }),
        experimental: {
          remoteFunctions: true,
        },
        alias: {
          $paraglide: "./src/paraglide",
          "@plugins": "./src/plugins",
          "@api": "./src/routes/api",
          "@auth": "./src/databases/auth",
          "@collections": "./config/collections",
          "@config": "./config",
          "@components": "./src/components",
          "@content": "./src/content",
          "@databases": "./src/databases",
          "@hooks": "./src/hooks",
          "@root": ".",
          "@services": "./src/services",
          "@src": "./src",
          "@static": "./static",
          "@stores": "./src/stores",
          "@themes": "./src/themes",
          "@types": "./src/types",
          "@utils": "./src/utils",
          "@widgets": "./src/widgets",
          "@tests": "./tests",
        },
        csrf: {
          trustedOrigins: [
            "http://127.0.0.1:4173",
            "http://127.0.0.1:4174",
            "http://127.0.0.1:4175",
            "http://127.0.0.1:4176",
            "http://127.0.0.1:4177",
            "http://127.0.0.1:4178",
            "http://127.0.0.1:4179",
            "http://localhost:4173",
          ],
        },
        csp: !isBuild
          ? undefined
          : {
              mode: "nonce",
              directives: {
                "default-src": ["self"],
                "script-src": [
                  "self",
                  "blob:",
                  "https://*.iconify.design",
                  "https://code.iconify.design",
                ],
                "worker-src": ["self", "blob:"],
                "style-src": ["self", "https://*.iconify.design"],
                "img-src": [
                  "self",
                  "data:",
                  "blob:",
                  "https://*.iconify.design",
                  "https://*.simplesvg.com",
                  "https://*.unisvg.com",
                  "https://placehold.co",
                  "https://api.qrserver.com",
                  "https://github.com",
                  "https://raw.githubusercontent.com",
                ],
                "font-src": ["self", "data:"],
                "connect-src": [
                  "self",
                  "https://*.iconify.design",
                  "https://*.simplesvg.com",
                  "https://*.unisvg.com",
                  "https://code.iconify.design",
                  "https://raw.githubusercontent.com",
                  "wss://*" as any,
                  "ws://*" as any,
                ],
                "object-src": ["none"],
                "base-uri": ["self"],
                "form-action": ["self"],
                "frame-src": ["self", "https://127.0.0.1:5173", "https://localhost:5173"],
              },
            },
      }),
      vitePlusInspectorPatchPlugin(),

      realtime({ typedImports: !isBuild }),
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
        "@iconify/svelte",
        "svelte-canvas",
        "svelte-dnd-action",
        "svelte-awesome-color-picker",
        "json-render-svelte",
      ],
      external: ["bun:sqlite", "bun:test", "redis", "mongoose", "mongodb", "postgres", "mysql2"],
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
      "process.env": "{}", // polyfill for server-only files (e.g. cors-utils) accidentally bundled client-side
      "import.meta.env.VITE_LOG_LEVELS": JSON.stringify(
        process.env.LOG_LEVELS || (isBuild ? "info,warn,error" : "info,warn,error,debug"),
      ),
    },
    build: {
      target: "esnext",
      minify: "esbuild",
      sourcemap: process.env.CI ? false : true,
      chunkSizeWarningLimit: 600, // Increase from 500KB (after optimizations)
      // Rolldown-specific: suppress informational plugin-timing and known intentional import warnings
      rolldownOptions: {
        external: ["@mongodb-js/zstd", "snappy"],
        checks: {
          // vite-plugin-sveltekit-guard (import graph analysis) and private-config-fallback
          // are necessary plugins whose timing overhead is expected and acceptable.
          pluginTimings: false,
        },
        onLog(level: any, log: any, defaultHandler: any) {
          if (
            log.code === "CIRCULAR_DEPENDENCY" &&
            (log.message?.includes("node_modules") ||
              log.ids?.some((id: string) => id.includes("node_modules")))
          ) {
            return;
          }
          if (log.code === "INEFFECTIVE_DYNAMIC_IMPORT") {
            const hasDb = log.message?.includes("databases/db.ts");
            const isWidgetStore = log.message?.includes("widget-store.svelte.ts");
            const isStateStore = log.message?.includes("state.svelte.ts");
            const isRichTextInput = log.message?.includes("rich-text/input.svelte");
            const isSettingsService = log.message?.includes("services/settings-service.ts");
            if (hasDb || isWidgetStore || isStateStore || isRichTextInput || isSettingsService) {
              return;
            }
          }
          defaultHandler(level, log);
        },
      },
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
            if (id.includes("node_modules/svelte")) {
              return "vendor-svelte";
            }
            if (id.includes("node_modules/@tiptap") || id.includes("node_modules/prosemirror")) {
              return "vendor-editor";
            }
            if (id.includes("node_modules/@aws-sdk") || id.includes("node_modules/@smithy")) {
              return "vendor-aws";
            }
            if (id.includes("node_modules/maplibre-gl")) {
              return "vendor-map";
            }
            // Group collaboration engine (Yjs)
            if (
              id.includes("node_modules/yjs") ||
              id.includes("node_modules/y-protocols") ||
              id.includes("node_modules/lib0")
            ) {
              return "vendor-collab";
            }
            // Group validation library
            if (id.includes("node_modules/valibot")) {
              return "vendor-validate";
            }
            // Group database ORM
            if (id.includes("node_modules/drizzle-orm")) {
              return "vendor-drizzle";
            }
          },
        },
        onwarn(warning: any, warn: any) {
          // Suppress circular dependency warnings from third-party libraries
          if (
            warning.code === "CIRCULAR_DEPENDENCY" &&
            (warning.message?.includes("node_modules") ||
              warning.ids?.some((id: string) => id.includes("node_modules")))
          ) {
            return;
          }
          // Suppress AWS SDK / Smithy re-export chunk-split warnings (harmless, third-party)
          if (
            warning.message?.includes("will end up in different chunks") &&
            (warning.message?.includes("@aws-sdk") || warning.message?.includes("@smithy"))
          ) {
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
          // db.ts is intentionally both statically imported (hooks, auth, core services)
          // and dynamically imported (setup wizard, background jobs) — it is a core
          // singleton and chunk-splitting it is not beneficial. Suppress the Rolldown
          // INEFFECTIVE_DYNAMIC_IMPORT diagnostic for this file.
          // db.ts is intentionally both statically imported and dynamically imported.
          // Suppress the INEFFECTIVE_DYNAMIC_IMPORT diagnostic for this file.
          const isIneffectiveImport =
            warning.code === "INEFFECTIVE_DYNAMIC_IMPORT" ||
            warning.message?.includes("INEFFECTIVE_DYNAMIC_IMPORT") ||
            warning.message?.includes("dynamic import will not move module");
          if (isIneffectiveImport) {
            const hasDb =
              warning.message?.includes("databases/db.ts") ||
              warning.id?.includes("databases/db.ts") ||
              (Array.isArray(warning.ids) &&
                warning.ids.some((id: string) => id.includes("databases/db.ts")));
            const isWidgetStore =
              warning.id?.includes("widget-store.svelte.ts") ||
              warning.message?.includes("widget-store.svelte.ts");
            const isStateStore =
              warning.id?.includes("state.svelte.ts") ||
              warning.message?.includes("state.svelte.ts");
            const isRichTextInput =
              warning.id?.includes("rich-text/input.svelte") ||
              warning.message?.includes("rich-text/input.svelte");
            const isSettingsService =
              warning.id?.includes("services/settings-service.ts") ||
              warning.message?.includes("services/settings-service.ts");
            if (hasDb || isWidgetStore || isStateStore || isRichTextInput || isSettingsService) {
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
          "mongoose",
          "mongodb",
          "@mongodb-js/zstd",
          "snappy",
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

    // ── vite-plus 0.2 unified toolchain config ──
    // Replaces .oxlintrc.json and .oxfmtrc.json
    lint: {
      ignorePatterns: [],
      env: { builtin: true },
    },
    fmt: {
      ignorePatterns: [],
    },
  };
});
