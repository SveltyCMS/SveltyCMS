/**
 * @file vite.config.ts
 * @description SveltyCMS Vite config — security/SSR/CMS plugins always on;
 *              optional DX plugins (inspector, quiet build, LiteRT WASM) gated.
 */
import { exec } from "node:child_process";
import { existsSync, readFileSync, readdirSync, promises as fsPromises } from "node:fs";
import { builtinModules } from "node:module";
import { platform } from "node:os";
import path from "node:path";
import adapter from "@sveltejs/adapter-node";

import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { sveltekit } from "@sveltejs/kit/vite";
import tailwindcss from "@tailwindcss/vite";

import { paraglideVitePlugin } from "@inlang/paraglide-js";
import type { Plugin, ViteDevServer } from "vite";
import { defineConfig } from "vitest/config";
import { isSetupComplete } from "./src/utils/setup-check-fast.ts";
import { securityCheckPlugin } from "./src/utils/vite-plugin-security-check.ts";
import { pathAliases } from "./path-aliases.ts";

process.env.ESBUILD_WORKER_THREADS = "0";

// ── Shared: externally maintained lists ────────────────────────────────────
const SERVER_EXTERNALS = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  "redis",
  "mongoose",
  "mongodb",
  "postgres",
  "mysql2",
  "@mongodb-js/zstd",
  "snappy",
  "typescript",
  "ts-node",
  "@tailwindcss/node",
  "jiti", // Build-time JIT — never imported at runtime; pulls zod v4
  "jiti/*", // Subpath imports from jiti internals
];

const SSR_NO_EXTERNAL = [
  "@iconify/svelte",
  "@thisux/sveltednd",
  "svelte-canvas",
  "svelte-dnd-action",
  "svelte-awesome-color-picker",
  "json-render-svelte",
  "drizzle-orm",
];

const OPTIMIZE_DEPS_INCLUDE = [
  "@sveltejs/kit",
  "svelte",
  "svelte/store",
  "svelte/reactivity",
  "@iconify/svelte",
  "@thisux/sveltednd",
  "svelte-canvas",
  "svelte-dnd-action",
  "svelte-awesome-color-picker",
  "json-render-svelte",
  "valibot",
  "drizzle-orm",
];

// ── Helpers ─────────────────────────────────────────────────────────────────
function openUrl(url: string) {
  const plat = platform();
  let cmd: string;
  if (plat === "win32") cmd = `start "" "${url}"`;
  else if (plat === "darwin") cmd = `open "${url}"`;
  else cmd = `xdg-open "${url}"`;
  exec(cmd);
}

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
  dashboardWidgets: path.resolve(CWD, "src/routes/(app)/dashboard/widgets"),
  themes: path.resolve(CWD, "src/themes"),
};

const useColor = process.stdout.isTTY;
const TAG = "\x1b[35m[SveltyCMS]\x1b[0m";
const log = {
  info: (m: string, ...a: unknown[]) =>
    console.log(useColor ? `${TAG} \x1b[36mℹ️\x1b[0m ${m}` : `[INFO] ${m}`, ...a),
  success: (m: string) => console.log(useColor ? `${TAG} \x1b[32m✅\x1b[0m ${m}` : `[OK] ${m}`),
  warn: (m: string) => console.warn(useColor ? `${TAG} \x1b[33m⚠️\x1b[0m ${m}` : `[WARN] ${m}`),
  error: (m: string, ...a: unknown[]) =>
    console.error(useColor ? `${TAG} \x1b[31m❌\x1b[0m ${m}` : `[ERROR] ${m}`, ...a),
};

async function initializeCollectionsStructure() {
  const dir = paths.compiledCollections;
  await fsPromises.mkdir(dir, { recursive: true });
  const { compile } = await import("./src/utils/compilation/compile.ts");
  await compile({
    userCollections: paths.userCollections,
    compiledCollections: paths.compiledCollections,
  });
}

// ── Vite Plugins ───────────────────────────────────────────────────────────

/** Strips test backdoors and stubs TipTap/ProseMirror in SSR */
function testBackdoorStripperPlugin(): Plugin {
  return {
    name: "test-backdoor-stripper",
    enforce: "pre",
    resolveId(id, _importer, options) {
      if (!id.includes("/") && !id.includes("\\")) return null;
      const norm = id.replace(/\\/g, "/");
      if (options?.ssr && (norm.includes("tiptap") || norm.includes("prosemirror")))
        return `\0virtual:ssr-stub:${id}`;
      if (
        process.env.NODE_ENV === "production" &&
        !process.env.TEST_MODE &&
        process.env.COMPILE_ALL_ADAPTERS !== "true"
      ) {
        if (norm.includes("handlers/testing") || norm.includes("src/hooks/handle-test-isolation"))
          return "\0virtual:test-noop";
      }
      return null;
    },
    load(id) {
      if (id === "\0virtual:test-noop")
        return {
          code: 'export const POST=()=>new Response("Not Found",{status:404});export const handleTestIsolation=({event,resolve})=>resolve(event);export const SVELTY_TEST_BACKDOOR_STRIPPED=true;export default{};',
          map: null,
        };
      if (id.startsWith("\0virtual:ssr-stub:"))
        return {
          code: "export const createEditor=()=>({});const noop=()=>({});export default new Proxy({},{get:()=>noop});",
          map: null,
        };
      return null;
    },
  };
}

/** Virtual fallback when config/private.ts is missing (CI, fresh clones) */
function privateConfigFallbackPlugin(): Plugin {
  const VID = "@config/private",
    VIDT = "@config/private.test";
  const RVID = `\0${VID}`,
    RVIDT = `\0${VIDT}`;
  const cache = new Map<string, string | null>();
  // Precheck / integration / E2E / COMPILE_ALL_ADAPTERS: never bind to live private.ts
  const isTestHarness =
    process.env.TEST_MODE === "true" ||
    process.env.COMPILE_ALL_ADAPTERS === "true" ||
    process.env.SVELTY_PRECHECK === "true" ||
    process.env.BENCHMARK === "true" ||
    process.env.PLAYWRIGHT_TEST === "true";

  return {
    name: "private-config-fallback",
    enforce: "pre",
    resolveId(id) {
      if (!id.includes("config/private") && id !== VID && id !== VIDT) return null;
      if (cache.has(id)) return cache.get(id);
      if (id === VID) return RVID;
      if (id === VIDT) return RVIDT;
      const nid = id.replace(/\\/g, "/");
      let result: string | null = null;
      // Automated builds: always resolve private.ts imports → private.test.ts
      // so live developer DB credentials never enter the test artifact.
      if (
        isTestHarness &&
        (id === VID || nid.endsWith("config/private.ts") || nid.endsWith("config/private"))
      ) {
        const tp = path.resolve(CWD, "config/private.test.ts");
        if (existsSync(tp)) {
          result = tp;
        } else {
          // Fall back to virtual module when private.test.ts is missing (CI)
          result = RVID;
        }
      } else if (nid.endsWith("config/private") || nid.endsWith("config/private.ts")) {
        // Live app only — real private.ts or virtual empty
        result = existsSync(path.resolve(CWD, "config/private.ts")) ? null : RVID;
      } else if (nid.endsWith("config/private.test") || nid.endsWith("config/private.test.ts")) {
        result = existsSync(path.resolve(CWD, "config/private.test.ts")) ? null : RVIDT;
      }
      cache.set(id, result);
      return result;
    },
    load(id) {
      if (id === RVID || id === RVIDT)
        return {
          code: `export const privateEnv={DB_TYPE:process.env.DB_TYPE||"",DB_HOST:process.env.DB_HOST||"127.0.0.1",DB_PORT:parseInt(process.env.DB_PORT||"27017"),DB_NAME:process.env.DB_NAME||"sveltycms",DB_USER:process.env.DB_USER||"",DB_PASSWORD:process.env.DB_PASSWORD||"",JWT_SECRET_KEY:process.env.JWT_SECRET_KEY||"",ENCRYPTION_KEY:process.env.ENCRYPTION_KEY||"",GOOGLE_CLIENT_ID:process.env.GOOGLE_CLIENT_ID||"",GOOGLE_CLIENT_SECRET:process.env.GOOGLE_CLIENT_SECRET||"",MULTI_TENANT:process.env.MULTI_TENANT==="true"};export const __VIRTUAL__=true;`,
          map: null,
        };
      return null;
    },
  };
}

/** Prevents server-only modules from leaking into client bundle */
function stubServerModulesPlugin(): Plugin {
  // Match DB drivers / infra — NOT SvelteKit route modules (+page.server.ts, +layout.server.ts,
  // proxy+*.server.ts under .svelte-kit/types). A broad `\.server\.` regex previously risked
  // stubbing Kit routes when resolve ran without options.ssr (Vite 8 env edge cases / direct fetches).
  const rx =
    /\.(mongodb|mariadb|postgresql|sqlite|redis|argon2|mongoose|mysql2|pg|aws-sdk|googleapis)/i;
  const pkgs = new Set([
    "argon2",
    "redis",
    "mongoose",
    "mongodb",
    "postgres",
    "mysql2",
    "bun:sqlite",
    "node-os-utils",
  ]);
  const files = new Set([
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
    "/src/databases/auth/session-manager.ts",
    "/src/databases/auth/two-factor-auth.ts",
    "/src/databases/auth/permissions.ts",
    "/src/content/engine.server.ts",
    "/src/content/loader.server.ts",
    "/src/components/emails/",
    "/src/services/security/audit-service.ts",
    "/src/databases/sqlite/adapter-core.ts",
  ]);
  return {
    name: "stub-server-modules",
    enforce: "pre",
    resolveId(id, _importer, options) {
      // SSR / test harness always need real modules
      if (options?.ssr || process.env.TEST_MODE === "true") return null;
      const nid = id.replace(/\\/g, "/");
      // Never stub Kit routes or generated type proxies (layout/page loaders)
      if (
        nid.includes("/src/routes/") ||
        nid.includes("/.svelte-kit/") ||
        /(?:^|\/)\+?(?:page|layout|server|error)(?:\.[^/]+)?$/.test(nid) ||
        nid.includes("proxy+")
      ) {
        return null;
      }
      // Only stub explicit *.server.ts modules outside routes (content/services helpers).
      // Scoped to /src/ so node_modules packages that ship `.server.js` helpers are never
      // silently stubbed in client builds.
      const isAppServerModule =
        /\.server\.(ts|js|svelte)(?=\?|$)/.test(nid) && nid.includes("/src/");
      if (pkgs.has(id) || rx.test(nid)) return "\0virtual:server-stub";
      if (isAppServerModule && !nid.includes("/routes/")) return "\0virtual:server-stub";
      if (files.has(nid) || [...files].some((f) => nid.endsWith(f) || nid.includes(f)))
        return "\0virtual:server-stub";
      return null;
    },
    load(id) {
      if (id === "\0virtual:server-stub")
        return {
          code: "export default{};export const logger={info(){},error(){},warn(){},debug(){}};",
          map: null,
        };
      return null;
    },
  };
}

/** Strips unused DB adapters from production builds */
function databaseAdapterStripperPlugin(): Plugin {
  const _isBuild = process.env.NODE_ENV === "production" || process.argv.includes("build");
  const isTest = process.env.TEST_MODE === "true" || process.env.VITEST === "true";
  const setupComplete = isSetupComplete();
  const compileAll = process.env.COMPILE_ALL_ADAPTERS === "true";
  if (!_isBuild || isTest || !setupComplete || compileAll)
    return { name: "database-adapter-stripper" };

  let activeDbType = process.env.DATABASE_ENGINE || process.env.DB_TYPE;
  if (!activeDbType) {
    try {
      const c = readFileSync(path.resolve(CWD, "config/private.ts"), "utf8");
      const m = c.match(/DB_TYPE\s*[:=]\s*["'](\w+)["']/);
      if (m) activeDbType = m[1];
    } catch {
      activeDbType = "sqlite";
    }
  }
  activeDbType = (activeDbType || "sqlite").toLowerCase();
  const map: Record<string, string[]> = {
    mongodb: ["mariadb", "postgresql", "sqlite"],
    mariadb: ["mongodb", "postgresql", "sqlite"],
    postgresql: ["mongodb", "mariadb", "sqlite"],
    sqlite: ["mongodb", "mariadb", "postgresql"],
  };
  const toStrip = map[activeDbType] || [];

  return {
    name: "database-adapter-stripper",
    enforce: "pre",
    async resolveId(id, _importer, options) {
      // Only strip from client builds — SSR needs real adapter exports
      if (options?.ssr) return null;
      const resolved = await this.resolve(id, undefined, { ...options, skipSelf: true });
      const nid = (resolved?.id || id).replace(/\\/g, "/");
      if (toStrip.some((db) => nid.includes(`/databases/${db}/`))) return "\0virtual:db-stub";
      return null;
    },
    load(id) {
      if (id === "\0virtual:db-stub") return { code: "export default{};", map: null };
      return null;
    },
  };
}

/** Shims Node.js APIs for browser */
function browserShimsPlugin(): Plugin {
  return {
    name: "browser-shims",
    enforce: "pre",
    resolveId(id, _importer, options) {
      // SSR must use real Node builtins — never shim server chunks.
      if (options?.ssr) return null;
      if (id === "node:path" || id === "path") return "\0virtual:browser-shim:path";
      if (id === "node:os" || id === "os") return "\0virtual:browser-shim:os";
      // jsdom is only used server-side in sanitize.svelte (!browser branch).
      // Shimming it prevents the 5.5 MB chunk from appearing in client builds.
      if (id === "jsdom") return "\0virtual:browser-shim:jsdom";
      return null;
    },
    load(id) {
      if (id === "\0virtual:browser-shim:path")
        return {
          code: `const join=(...a)=>a.join("/");const resolve=(...a)=>a.join("/");const dirname=(p)=>p.split("/").slice(0,-1).join("/")||".";const basename=(p)=>p.split("/").pop()||"";export{join,resolve,dirname,basename};export default{join,resolve,dirname,basename};`,
          map: null,
        };
      if (id === "\0virtual:browser-shim:os")
        return {
          code: `const platform=()=>"browser";const cpus=()=>[];const totalmem=()=>0;const freemem=()=>0;export{platform,cpus,totalmem,freemem};export default{platform,cpus,totalmem,freemem};`,
          map: null,
        };
      if (id === "\0virtual:browser-shim:jsdom")
        return {
          // Client-side stub — real jsdom is never used on client.
          // The only consumer (sanitize.svelte) guards this behind `!browser`.
          code: `// @ts-nocheck\nexport class JSDOM { constructor() { this.window = {}; } }\nexport { JSDOM as default };`,
          map: null,
        };
      return null;
    },
  };
}

/** Core CMS HMR: collections (via syncContentState), widgets, themes, setup wizard auto-open */
function sveltyCmsPlugin(): Plugin {
  let wasPrivateConfigMissing = false;
  let compileTimeout: NodeJS.Timeout;
  let widgetTimeout: NodeJS.Timeout;
  /** Debounced batch of collection source paths + whether any was a delete/unlink */
  const pendingCollectionFiles = new Set<string>();
  let pendingCollectionDelete = false;

  const handleHmr = async (server: ViteDevServer, event: string, file: string) => {
    const absoluteFile = path.resolve(file);
    const isCollectionFile =
      absoluteFile.startsWith(paths.userCollections) && /\.(ts|js)$/.test(file);
    const isWidgetFile =
      absoluteFile.startsWith(paths.widgets) &&
      (file.endsWith("index.ts") || file.endsWith(".svelte"));
    const isDashboardWidgetFile =
      absoluteFile.startsWith(paths.dashboardWidgets) &&
      (file.endsWith(".svelte") || file.endsWith("widget.json") || file.endsWith(".mdx"));
    const isPrivateConfig = absoluteFile === paths.privateConfig;

    if (isPrivateConfig) {
      log.info("config/private.ts detected! Triggering restart...");
      server.ws.send("svelty:setup-complete", {
        timestamp: Date.now(),
        message: "System initialized. Restarting...",
      });
      setTimeout(() => server.ws.send({ type: "full-reload", path: "*" }), 500);
      return;
    }

    if (isCollectionFile) {
      pendingCollectionFiles.add(absoluteFile);
      if (event === "unlink" || event === "unlinkDir") pendingCollectionDelete = true;

      clearTimeout(compileTimeout);
      compileTimeout = setTimeout(async () => {
        const files = Array.from(pendingCollectionFiles);
        const fullBuild = pendingCollectionDelete || files.length !== 1;
        pendingCollectionFiles.clear();
        pendingCollectionDelete = false;

        try {
          // Single coordinator: compile → refresh → models → metrics (no ad-hoc createModel loops).
          // Use server.ssrLoadModule (NOT a plain dynamic import): the config file is bundled by
          // Vite's config loader with esbuild, which cannot resolve `@utils`/`@stores` aliases —
          // a bare import here breaks `svelte-kit sync` / svelte-check for the whole project.
          const mod = await server.ssrLoadModule(
            path.join(CWD, "src/content/sync-content-state.server.ts"),
          );
          const syncContentState =
            mod.syncContentState as (typeof import("./src/content/sync-content-state.server.ts"))["syncContentState"];

          const relativeTarget =
            !fullBuild && files[0]
              ? path.relative(paths.userCollections, files[0]).replace(/\\/g, "/")
              : undefined;

          const result = await syncContentState({
            reason: "watcher",
            changedFile: files[0] ?? null,
            targetFile: relativeTarget ?? null,
            fullBuild,
          });

          if (result.skippedByDedupe) {
            log.info("Collection watcher skipped (GUI compile session active)");
            return;
          }

          if (result.noOp) {
            log.info(
              `Collection compile no-op (${result.metrics.totalMs}ms, ${result.metrics.skipped} skipped)`,
            );
            return;
          }

          // Content types — optional; missing script must not break HMR
          if ((result.compiled?.processed ?? 0) > 0) {
            try {
              const typesMod = await server.ssrLoadModule(
                path.join(CWD, "scripts/generate-content-types.ts"),
              );
              if (typeof typesMod.generateContentTypes === "function") {
                await typesMod.generateContentTypes(server);
              }
            } catch (e) {
              log.warn(
                `generateContentTypes skipped: ${e instanceof Error ? e.message : String(e)}`,
              );
            }
          }

          // Structured HMR — include changedNodes for surgical client patch (skip full layout refetch)
          server.ws.send("svelty:content-update", {
            timestamp: Date.now(),
            reason: "watcher",
            contentVersion: result.contentVersion,
            changedIds: result.changedIds,
            changedNodes: result.changedNodes,
            requiresLayoutInvalidate: result.requiresLayoutInvalidate,
            fullBuild,
            processed: result.metrics.processed,
            skipped: result.metrics.skipped,
            durationMs: result.metrics.totalMs,
            metrics: result.metrics,
            noOp: false,
          });

          log.success(
            `Content sync ${result.metrics.totalMs}ms (compile=${result.metrics.compileMs}, models=${result.metrics.modelMs}, ${result.metrics.processed} processed, surgical=${!result.requiresLayoutInvalidate})`,
          );
        } catch (e) {
          log.error("Collection recompile failed:", e);
        }
      }, 150);
    }

    if (isWidgetFile) {
      clearTimeout(widgetTimeout);
      widgetTimeout = setTimeout(async () => {
        try {
          const { widgetStoreActions } = await server.ssrLoadModule(
            path.join(CWD, "src/stores/widget-store.svelte.ts"),
          );
          await widgetStoreActions.reload();
          server.ws.send({ type: "full-reload", path: "*" });
          log.success("Widgets reloaded.");
        } catch (e) {
          log.error("Widget reload failed:", e);
        }
      }, 150);
    }

    if (isDashboardWidgetFile) {
      // Dashboard widget packages are discovered via import.meta.glob at
      // page-load — a full reload re-evaluates the glob, picking up new
      // folders (added/removed packages) the same way the custom-widget
      // watcher handles src/widgets. Changed components get Vite HMR plus
      // this reload for a consistent registry.
      clearTimeout(widgetTimeout);
      widgetTimeout = setTimeout(() => {
        server.ws.send({ type: "full-reload", path: "*" });
        log.success("Dashboard widgets reloaded.");
      }, 150);
    }

    const isThemeFile = absoluteFile.startsWith(paths.themes) && file.endsWith(".json");
    if (isThemeFile) {
      setTimeout(async () => {
        try {
          const { syncThemeFile } = await server.ssrLoadModule(
            path.join(CWD, "src/services/core/theme-file-sync.ts"),
          );
          const result = await syncThemeFile(file);
          if (result.action === "created" || result.action === "updated")
            log.success(`Theme "${result.name}" ${result.action}.`);
          server.ws.send("svelty:theme-update", { name: result.name, timestamp: Date.now() });
        } catch (e) {
          log.error("Theme sync failed:", e);
        }
      }, 200);
    }
  };

  return {
    name: "svelty-cms-main",
    async buildStart() {
      wasPrivateConfigMissing = !existsSync(paths.privateConfig);
      if (wasPrivateConfigMissing) await fsPromises.mkdir(paths.configDir, { recursive: true });
      await initializeCollectionsStructure();
    },
    config: () => ({
      define: {
        __FRESH_INSTALL__: JSON.stringify(wasPrivateConfigMissing),
        __SVELTY_SETUP_COMPLETE__: JSON.stringify(!wasPrivateConfigMissing),
      },
    }),
    configureServer(server) {
      server.watcher.on("all", (event, file) => handleHmr(server, event, file));
      if (wasPrivateConfigMissing) {
        const orig = server.listen;
        server.listen = function (port?: number, isRestart?: boolean) {
          const result = orig.apply(this, [port, isRestart]);
          result.then(() =>
            setTimeout(() => {
              const addr = server.httpServer?.address();
              const p = typeof addr === "object" && addr ? addr.port : 5173;
              openUrl(`http://127.0.0.1:${p}/setup`);
            }, 1000),
          );
          return result;
        };
      }
    },
  };
}

/**
 * Build warning manager — filters non-actionable noise, deduplicates remaining
 * SOURCEMAP_BROKEN warnings from third-party plugins.
 *
 * Our custom plugins (test-backdoor-stripper, private-config-fallback,
 * stub-server-modules, database-adapter-stripper, browser-shims) return
 * `{ code, map: null }` from their load() hooks, so they no longer trigger
 * this warning. Only third-party plugins (@tailwindcss/vite, SvelteKit
 * remote functions) may still emit it.
 */
function buildWarningManagerPlugin(): Plugin {
  const sourcemapCounts = new Map<string, number>();
  let originalWarn: typeof console.warn;
  let installed = false;

  const noisePatterns = [
    /Circular dependency:.*node_modules/i,
    /could not be resolved.*treating it as an external/i,
    /".*" is imported from external module ".*" but never used/i,
    /\[PLUGIN_TIMINGS\]/i,
    /Your build spent significant time in plugins/i,
  ];

  const sourcemapPattern = /\[SOURCEMAP_BROKEN\]|Sourcemap is likely to be incorrect/i;

  function install() {
    if (installed) return;
    installed = true;
    originalWarn = console.warn;

    const filter = (message: string): boolean => {
      if (noisePatterns.some((p) => p.test(message))) return true;
      if (sourcemapPattern.test(message)) {
        const match = message.match(/\[([^\]]+)\]/);
        const plugin = match?.[1] ?? "unknown";
        sourcemapCounts.set(plugin, (sourcemapCounts.get(plugin) ?? 0) + 1);
        return true;
      }
      return false;
    };

    console.warn = (...args: unknown[]) => {
      const message = args.map((a) => (typeof a === "string" ? a : String(a ?? ""))).join(" ");
      if (filter(message)) return;
      originalWarn.apply(console, args);
    };

    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = (chunk: any, ...rest: any[]): boolean => {
      const message = typeof chunk === "string" ? chunk : (chunk?.toString?.() ?? "");
      if (filter(message)) return true;
      return originalStderrWrite(chunk, ...rest);
    };
  }

  return {
    name: "build-warning-manager",
    apply: "build",
    enforce: "pre",
    config(_config: any, _env: any) {
      install();
    },
    buildEnd() {
      if (originalWarn) console.warn = originalWarn;
      if (sourcemapCounts.size === 0) return;
      const lines = [...sourcemapCounts].map(([p, c]) => `  ${p}: ${c} file(s)`);
      originalWarn(
        `\n[SOURCEMAP_BROKEN] Third-party plugins (not actionable):\n${lines.join("\n")}\n`,
      );
    },
  };
}

/** Serves LiteRT.js WASM binaries with correct MIME type from static/ai/wasm/. */
function liteRtWasmPlugin(): Plugin {
  const WASM_RE = /^\/ai\/wasm\//;
  return {
    name: "litert-wasm",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !WASM_RE.test(req.url)) return next();
        const filePath = path.join(CWD, "static", req.url);
        if (!existsSync(filePath)) {
          res.statusCode = 404;
          res.end("WASM file not found. Place LiteRT.js WASM binaries in static/ai/wasm/");
          return;
        }
        const ext = path.extname(req.url);
        const mime =
          ext === ".wasm"
            ? "application/wasm"
            : ext === ".js"
              ? "application/javascript"
              : "application/octet-stream";
        res.writeHead(200, {
          "Content-Type": mime,
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Cache-Control": "public, max-age=86400",
        });
        const content = readFileSync(filePath);
        res.end(content);
      });
    },
  };
}

function copyWorkerFilePlugin(): Plugin {
  return {
    name: "copy-module-worker",
    apply: "build",
    async writeBundle() {
      const src = path.resolve(CWD, "src/content/module-worker.server.ts");
      const dest = path.resolve(CWD, "build/server/chunks/module-worker.server.ts");
      try {
        await fsPromises.mkdir(path.dirname(dest), { recursive: true });
        await fsPromises.copyFile(src, dest);
        log.info("Copied module-worker.server.ts to build output");
      } catch (e: unknown) {
        log.warn(`Failed to copy worker file: ${(e as Error).message}`);
      }
    },
  };
}

/**
 * adapter-node v6 (SvelteKit 3) post-build patches for the emitted server
 * handler chunk:
 *
 * 1. `origin` is inlined at BUILD time (`const origin = ORIGIN`, i.e.
 *    `const origin = void 0` when unset). It never reads `process.env.ORIGIN`
 *    at runtime and falls back to deriving the origin from request headers
 *    with a hardcoded `https` protocol default. On plain-HTTP previews
 *    (CI e2e-prep, local `node build/index.js`, the `index.cjs` Plesk entry)
 *    SvelteKit's remote same-origin gate then computes a self-origin of
 *    `https://127.0.0.1:4173` while the browser sends
 *    `Origin: http://127.0.0.1:4173`, so every non-GET remote function
 *    (e.g. `completeSetup` in the setup wizard) is rejected with 403
 *    "Cross-site remote requests are forbidden".
 *    Fix: restore the adapter-node v5 runtime contract — read `ORIGIN` from
 *    the environment at server start. When unset, behaviour is unchanged.
 *
 * 2. On Windows, Rolldown's code-splitting group for the adapter's `dir.js`
 *    entry (which should emit `build/dir.js`) fails to match the Windows
 *    path, so `dir.js` gets INLINED into the handler chunk as
 *    `const dir = dirname(fileURLToPath(import.meta.url))`. Since the chunk
 *    lives in `build/server/chunks/`, `dir` resolves there instead of the
 *    build root, and every client asset 404s (asset_dir =
 *    `<chunks>/client`) — the app never hydrates. On Linux the group splits
 *    correctly, so this only rewrites the inlined form when present.
 */
function adapterNodeBuildPatchPlugin(): Plugin {
  return {
    name: "adapter-node-build-patch",
    apply: "build",
    // The kit adapter finalises `build/` in its own `buildApp` (order: 'post').
    // Running as a post buildApp hook in array order means we patch AFTER the
    // adapter has written the handler chunk.
    buildApp: {
      order: "post",
      async handler() {
        const chunkDirs = [
          path.resolve(CWD, "build/server/chunks"),
          path.resolve(CWD, ".svelte-kit/output/server/chunks"),
        ];
        const originPattern = /const origin\s*=\s*(?:void 0|undefined);/;
        const inlineDirRegion =
          /\/\/#region \.svelte-kit\/adapter-node\/entries\/dir\.js\nconst dir = dirname\(fileURLToPath\(import\.meta\.url\)\);\n\/\/#endregion/;
        for (const dir of chunkDirs) {
          if (!existsSync(dir)) continue;
          for (const file of readdirSync(dir)) {
            if (!/^handler-.*\.js$/.test(file)) continue;
            const filePath = path.join(dir, file);
            let code = readFileSync(filePath, "utf8");
            let changed = false;
            if (originPattern.test(code)) {
              code = code.replace(originPattern, "const origin = process.env.ORIGIN;");
              changed = true;
            }
            if (inlineDirRegion.test(code)) {
              // Resolve the build root explicitly: chunks dir -> ../.. (works on
              // Windows and Linux regardless of the chunk's hashed filename).
              code = code.replace(
                inlineDirRegion,
                '//#region .svelte-kit/adapter-node/entries/dir.js (patched: resolve build root)\nconst dir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");\n//#endregion',
              );
              changed = true;
            }
            if (changed) {
              await fsPromises.writeFile(filePath, code);
              log.info(`patched adapter handler (${path.relative(CWD, filePath)})`);
            }
          }
        }
      },
    },
  };
}

/**
 * Vite 8 serves `/@vite/client` from `bundledDevClient.mjs` (and may use Windows
 * backslash ids). Built-in `@sveltejs/vite-plugin-svelte` inspector only transforms
 * `vite/dist/client/client.mjs`, so Alt+X never mounts.
 *
 * Restores the inject that used to live as `vitePlusInspectorPatchPlugin` /
 * top-level `svelteInspector()` before the Jul 2026 vite.config slim-down
 * (f5bad175 / e4ae0df25). Virtual modules still come from vitePlugin.inspector.
 *
 * Also patches Inspector.svelte (must run pre-compile):
 * - `svelte:window onclick={disable}` races with the toggle button click
 *   (enable → bubble → disable in the same gesture), so the S button appeared dead.
 * - key listeners moved to window capture so Alt+X works with focused controls.
 */
function svelteInspectorInjectPlugin(): Plugin {
  const WINDOW_CLICK_FIX =
    "onclick={(e) => { const t = e.target; if (t && typeof t.closest === 'function' && t.closest('#svelte-inspector-toggle, #svelte-inspector-overlay, #svelte-inspector-host')) return; disable(); }}";

  return {
    name: "svelty-svelte-inspector-inject",
    apply: "serve",
    enforce: "pre",
    transform: {
      order: "pre",
      handler(code, id) {
        const norm = id.replace(/\\/g, "/");
        if (
          !(
            norm.includes("vite-plugin-svelte") &&
            norm.includes("inspector") &&
            norm.includes("Inspector.svelte")
          )
        ) {
          return null;
        }

        let next = code;

        // 1) Window click must not undo the toggle button in the same gesture.
        // Guard on our marker — the source already contains #svelte-inspector-toggle as the button id.
        if (next.includes("onclick={disable}") && !next.includes("svelty-inspector-click-patch")) {
          next = next.replace(
            "onclick={disable}",
            "/* svelty-inspector-click-patch */ " + WINDOW_CLICK_FIX,
          );
        }

        // 2) Toggle click stops bubbling to window (stop() already uses stopPropagation elsewhere)
        if (
          next.includes("onclick={() => toggle()}") &&
          !next.includes("svelty-inspector-toggle-patch")
        ) {
          next = next.replace(
            "onclick={() => toggle()}",
            "/* svelty-inspector-toggle-patch */ onclick={(e) => { e.stopPropagation(); e.preventDefault(); toggle(); }}",
          );
        }

        // 3) Host stacking above setup chrome (absolute footer, etc.)
        if (
          next.includes(":global(#svelte-inspector-host)") &&
          !next.includes("z-index: 2147483646")
        ) {
          next = next.replace(
            /:global\(#svelte-inspector-host\)\s*\{\s*direction:\s*ltr;\s*\}/,
            [
              ":global(#svelte-inspector-host) {",
              "\tdirection: ltr;",
              "\tposition: relative;",
              "\tz-index: 2147483646;",
              "\tpointer-events: none;",
              "}",
              ":global(#svelte-inspector-host #svelte-inspector-toggle),",
              ":global(#svelte-inspector-host #svelte-inspector-overlay) {",
              "\tpointer-events: auto;",
              "\tz-index: 2147483647;",
              "}",
            ].join("\n"),
          );
        }

        // 4) Key handlers on window (capture) — body listeners miss focused inputs / shadow targets
        if (
          next.includes("document.body.addEventListener('keydown', keydown)") &&
          !next.includes("svelty-inspector-key-patch")
        ) {
          next = next.replace(
            /document\.body\.addEventListener\('keydown',\s*keydown\);\s*if\s*\(options\.holdMode\)\s*\{\s*document\.body\.addEventListener\('keyup',\s*keyup\);\s*\}/,
            [
              "// svelty-inspector-key-patch",
              "window.addEventListener('keydown', keydown, true);",
              "if (options.holdMode) {",
              "\twindow.addEventListener('keyup', keyup, true);",
              "}",
            ].join("\n\t\t\t"),
          );
          next = next.replace(
            /document\.body\.removeEventListener\('keydown',\s*keydown\);\s*if\s*\(options\.holdMode\)\s*\{\s*document\.body\.removeEventListener\('keyup',\s*keyup\);\s*\}/,
            [
              "window.removeEventListener('keydown', keydown, true);",
              "if (options.holdMode) {",
              "\twindow.removeEventListener('keyup', keyup, true);",
              "}",
            ].join("\n\t\t\t"),
          );
        }

        // 5) Toggle button z-index explicit (position already fixed in upstream CSS)
        if (
          next.includes("#svelte-inspector-toggle {") &&
          !next.includes("/* svelty-toggle-z */")
        ) {
          next = next.replace(
            /#svelte-inspector-toggle\s*\{/,
            "#svelte-inspector-toggle {\n\t/* svelty-toggle-z */\n\tz-index: 2147483647;",
          );
        }

        return next !== code ? { code: next, map: null } : null;
      },
    },
  };
}

/** Post-enforce inject of inspector bootstrap into Vite 8 client modules. */
function svelteInspectorClientInjectPlugin(): Plugin {
  const INJECT = "\nimport('virtual:svelte-inspector-path:load-inspector.js')";
  return {
    name: "svelty-svelte-inspector-client-inject",
    apply: "serve",
    enforce: "post",
    transform(code, id) {
      const norm = id.replace(/\\/g, "/");
      const isViteClient =
        norm.includes("/vite/dist/client/client.mjs") ||
        norm.includes("/vite/dist/client/bundledDevClient.mjs") ||
        /\/@vite\/client(?:\?|$)/.test(norm) ||
        norm.endsWith("vite/dist/client/client.mjs") ||
        norm.endsWith("vite/dist/client/bundledDevClient.mjs");
      if (!isViteClient) return;
      if (code.includes("virtual:svelte-inspector-path:load-inspector")) return;
      return { code: `${code}${INJECT}`, map: null };
    },
  };
}

// ── Smart feature gates (optional plugins only when useful) ────────────────
//
// Core security / SSR / CMS plugins always run.
// DX-only plugins (inspector, build log filter, LiteRT WASM middleware) register
// only when the environment actually needs them.

const isBuildCmd =
  process.env.NODE_ENV === "production" ||
  process.argv.includes("build") ||
  process.argv.includes("vite-build");
const isTestHarness =
  process.env.TEST_MODE === "true" ||
  process.env.VITEST === "true" ||
  process.env.PLAYWRIGHT_TEST === "true" ||
  process.env.BENCHMARK === "true" ||
  process.env.SVELTY_PRECHECK === "true" ||
  process.env.CI === "true";

/** Dev inspector: serve only, never CI/test, overridable via env. */
function shouldEnableInspector(): boolean {
  // Explicit kill-switch (also respects upstream SVELTE_INSPECTOR_OPTIONS=false)
  if (process.env.SVELTE_INSPECTOR_OPTIONS === "false") return false;
  if (process.env.SVELTY_INSPECTOR === "0" || process.env.SVELTY_INSPECTOR === "false")
    return false;
  if (process.env.SVELTY_INSPECTOR === "1" || process.env.SVELTY_INSPECTOR === "true") return true;
  // Default: local interactive dev only
  if (isBuildCmd || isTestHarness) return false;
  return true;
}

/**
 * Build log noise filter: useful in CI/local builds, skip when you want raw output.
 * Override: SVELTY_VERBOSE_BUILD=1 → off; SVELTY_QUIET_BUILD=0 → off.
 */
function shouldEnableBuildWarningManager(): boolean {
  if (process.env.SVELTY_VERBOSE_BUILD === "1" || process.env.SVELTY_VERBOSE_BUILD === "true") {
    return false;
  }
  if (process.env.SVELTY_QUIET_BUILD === "0" || process.env.SVELTY_QUIET_BUILD === "false") {
    return false;
  }
  // apply:"build" already no-ops on serve; still skip registering when not building
  return isBuildCmd || process.env.CI === "true";
}

/**
 * LiteRT client WASM middleware — only when assets exist or AI client is forced on.
 * `static/ai/wasm` often only has `.gitkeep` until binaries are installed.
 * Prod/static hosting serves files via the adapter; this plugin is dev middleware only.
 */
function shouldEnableLiteRtWasm(): boolean {
  if (process.env.SVELTY_AI_CLIENT === "0" || process.env.SVELTY_AI_CLIENT === "false")
    return false;
  if (process.env.SVELTY_AI_CLIENT === "1" || process.env.SVELTY_AI_CLIENT === "true") return true;
  if (isBuildCmd || isTestHarness) return false;

  const wasmDir = path.resolve(CWD, "static/ai/wasm");
  if (!existsSync(wasmDir)) return false;
  try {
    return readdirSync(wasmDir).some((name) => !name.startsWith(".") && name !== ".gitkeep");
  } catch {
    return false;
  }
}

// ── Config ─────────────────────────────────────────────────────────────────

export default defineConfig(() => {
  const enableInspector = shouldEnableInspector();
  const enableQuietBuild = shouldEnableBuildWarningManager();
  const enableLiteRt = shouldEnableLiteRtWasm();

  if (process.env.SVELTY_VITE_DEBUG === "1") {
    log.info(
      `feature gates → inspector=${enableInspector} quietBuild=${enableQuietBuild} liteRtWasm=${enableLiteRt}`,
    );
  }

  return {
    plugins: [
      // ── Always: production correctness / security / CMS ─────────────────
      ...(enableQuietBuild ? [buildWarningManagerPlugin()] : []),
      tailwindcss() as any,
      databaseAdapterStripperPlugin(),
      testBackdoorStripperPlugin(),
      privateConfigFallbackPlugin(),
      stubServerModulesPlugin(),
      browserShimsPlugin(),
      sveltekit({
        preprocess: [vitePreprocess()],
        compilerOptions: { runes: true },
        // 🚀 SK3: vite-plugin-svelte options pass through directly (vitePlugin removed)
        inspector: enableInspector
          ? {
              // Sticky toggle: Alt+X once on, again/Esc off (holdMode flaky on Windows)
              toggleKeyCombo: "alt-x",
              holdMode: false,
              showToggleButton: "always",
              toggleButtonPos: "bottom-right",
            }
          : false,
        adapter: adapter({ out: "build", precompress: true }),
        experimental: { remoteFunctions: true },
        // Bench/integration matrices bind 4173 + random offset; trust loopback port range.
        csrf: {
          trustedOrigins: [
            "http://127.0.0.1:4173",
            "http://localhost:4173",
            ...Array.from({ length: 600 }, (_, i) => `http://127.0.0.1:${4173 + i}`),
            ...Array.from({ length: 600 }, (_, i) => `http://localhost:${4173 + i}`),
          ],
        },
      }),
      // ── Optional: dev-only inspector inject/patch (Vite 8 client path) ──
      ...(enableInspector
        ? [svelteInspectorInjectPlugin(), svelteInspectorClientInjectPlugin()]
        : []),
      // ── Optional: client AI WASM only when assets / flag present ────────
      ...(enableLiteRt ? [liteRtWasmPlugin()] : []),
      sveltyCmsPlugin(),
      securityCheckPlugin(),
      copyWorkerFilePlugin(),
      adapterNodeBuildPatchPlugin(),
      paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/paraglide" }),
    ],
    // 🚀 SK3: aliases moved from the deprecated `config.alias` to plain Vite
    // resolve.alias (types are wired via `paths` in tsconfig.json). Vite needs
    // ABSOLUTE targets — relative entries would duplicate modules.
    resolve: {
      alias: Object.fromEntries(
        Object.entries(pathAliases).map(([key, target]) => [key, path.resolve(CWD, target)]),
      ),
    },
    server: {
      fs: { allow: ["static", "."], deny: ["**/tests/**"] },
      watch: {
        ignored: [
          "**/config/private*.ts",
          "**/.compiledCollections/**",
          "**/tests/**",
          "**/logs/**",
          "**/mediaFolder/**",
          "**/src/content/types.ts",
          "**/src/paraglide/**",
        ],
      },
    },
    ssr: { noExternal: SSR_NO_EXTERNAL, external: SERVER_EXTERNALS },
    define: {
      __SVELTY_SETUP_COMPLETE__: isSetupComplete(),
      global: "globalThis",
      // NEVER replace `"process.env": "{}"` — Rolldown/Vite then rewrites every
      // `process.env.FOO` access to `{}.FOO` (always undefined) in SSR chunks.
      // That breaks TEST_MODE, setup-check, integration preview, and any runtime
      // flag. Client bundles must not import server secrets; use $env modules.
    },
    build: {
      target: "esnext",
      minify: "esbuild" as const,
      sourcemap: !process.env.CI,
      chunkSizeWarningLimit: 1200,
      // Rolldown (Vite 8): disable plugin-timing spam; still measurable via --debug if needed.
      checks: { pluginTimings: false },
      rollupOptions: {
        external: SERVER_EXTERNALS,
        output: {
          // Force the plugin catalog (registration loop) into a shared shell chunk
          // for the SSR build. NOTE: SvelteKit's CLIENT environment sets its own
          // `output.codeSplitting`, which makes Rolldown IGNORE `manualChunks` —
          // the client-side guarantee instead comes from `registerPluginSlots()`
          // being called by the root layout (src/routes/+layout.svelte), which
          // binds the catalog into the entry shell as a runtime dependency.
          manualChunks(id: string) {
            if (id.includes("/src/plugins/index.ts")) return "plugin-shell";
            return undefined;
          },
        },
      },
    },
    optimizeDeps: {
      exclude: [...SERVER_EXTERNALS, "@src/databases/cache/cache-service"],
      include: OPTIMIZE_DEPS_INCLUDE,
      entries: ["!tests/**/*", "!**/*.server.ts", "!**/*.server.js"],
    },
    lint: { ignorePatterns: [], env: { builtin: true } },
    fmt: { ignorePatterns: [] },
  };
});
