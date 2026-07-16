/**
 * @file vite.config.ts
 * @description SveltyCMS Vite config — ~350 lines. Security plugins inline,
 *              shared exports list, no warning suppression.
 */
import { exec } from "node:child_process";
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
import { pathAliases } from "./path-aliases";

process.env.ESBUILD_WORKER_THREADS = "0";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Shared: externally maintained lists ────────────────────────────────────
const SERVER_EXTERNALS = [
  ...builtinModules, ...builtinModules.map((m) => `node:${m}`),
  "redis", "mongoose", "mongodb", "postgres", "mysql2",
  "@mongodb-js/zstd", "snappy", "typescript", "ts-node", "@tailwindcss/node",
];

const SSR_NO_EXTERNAL = [
  "@iconify/svelte", "svelte-canvas", "svelte-dnd-action",
  "svelte-awesome-color-picker", "json-render-svelte", "drizzle-orm",
];

const OPTIMIZE_DEPS_INCLUDE = [
  "@iconify/svelte", "svelte-canvas", "svelte-dnd-action",
  "svelte-awesome-color-picker", "json-render-svelte", "valibot", "drizzle-orm",
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
  compiledCollections: path.resolve(CWD, process.env.COMPILED_COLLECTIONS_DIR || ".compiledCollections"),
  widgets: path.resolve(CWD, "src/widgets"),
  themes: path.resolve(CWD, "src/themes"),
};

const useColor = process.stdout.isTTY;
const TAG = "\x1b[35m[SveltyCMS]\x1b[0m";
const log = {
  info: (m: string, ...a: unknown[]) => console.log(useColor ? `${TAG} \x1b[36mℹ️\x1b[0m ${m}` : `[INFO] ${m}`, ...a),
  success: (m: string) => console.log(useColor ? `${TAG} \x1b[32m✅\x1b[0m ${m}` : `[OK] ${m}`),
  warn: (m: string) => console.warn(useColor ? `${TAG} \x1b[33m⚠️\x1b[0m ${m}` : `[WARN] ${m}`),
  error: (m: string, ...a: unknown[]) => console.error(useColor ? `${TAG} \x1b[31m❌\x1b[0m ${m}` : `[ERROR] ${m}`, ...a),
};

async function initializeCollectionsStructure() {
  const dir = paths.compiledCollections;
  await fsPromises.mkdir(dir, { recursive: true });
  const { compile } = await import("./src/utils/compilation/compile");
  await compile({ userCollections: paths.userCollections, compiledCollections: paths.compiledCollections });
}

// ── Vite Plugins ───────────────────────────────────────────────────────────

/** Strips test backdoors and stubs TipTap/ProseMirror in SSR */
function testBackdoorStripperPlugin(): Plugin {
  return {
    name: "test-backdoor-stripper", enforce: "pre",
    resolveId(id, _importer, options) {
      if (!id.includes("/") && !id.includes("\\")) return null;
      const norm = id.replace(/\\/g, "/");
      if (options?.ssr && (norm.includes("tiptap") || norm.includes("prosemirror"))) return `\0virtual:ssr-stub:${id}`;
      if (process.env.NODE_ENV === "production" && !process.env.TEST_MODE && process.env.COMPILE_ALL_ADAPTERS !== "true") {
        if (norm.includes("handlers/testing") || norm.includes("src/hooks/handle-test-isolation")) return "\0virtual:test-noop";
      }
      return null;
    },
    load(id) {
      if (id === "\0virtual:test-noop") return 'export const POST=()=>new Response("Not Found",{status:404});export const handleTestIsolation=({event,resolve})=>resolve(event);export default{};';
      if (id.startsWith("\0virtual:ssr-stub:")) return "export const createEditor=()=>({});const noop=()=>({});export default new Proxy({},{get:()=>noop});";
      return null;
    },
  };
}

/** Virtual fallback when config/private.ts is missing (CI, fresh clones) */
function privateConfigFallbackPlugin(): Plugin {
  const VID = "@config/private", VIDT = "@config/private.test";
  const RVID = `\0${VID}`, RVIDT = `\0${VIDT}`;
  const cache = new Map<string, string | null>();
  const isTest = process.env.TEST_MODE === "true" || process.env.COMPILE_ALL_ADAPTERS === "true";

  return {
    name: "private-config-fallback", enforce: "pre",
    resolveId(id) {
      if (!id.includes("config/private") && id !== VID && id !== VIDT) return null;
      if (cache.has(id)) return cache.get(id);
      if (id === VID) return RVID;
      if (id === VIDT) return RVIDT;
      const nid = id.replace(/\\/g, "/");
      let result: string | null = null;
      if (isTest && (id === VID || nid.endsWith("config/private.ts"))) {
        const tp = path.resolve(CWD, "config/private.test.ts");
        if (existsSync(tp)) result = tp;
      } else if (nid.endsWith("config/private") || nid.endsWith("config/private.ts")) {
        result = existsSync(path.resolve(CWD, "config/private.ts")) ? null : RVID;
      } else if (nid.endsWith("config/private.test") || nid.endsWith("config/private.test.ts")) {
        result = existsSync(path.resolve(CWD, "config/private.test.ts")) ? null : RVIDT;
      }
      cache.set(id, result);
      return result;
    },
    load(id) {
      if (id === RVID || id === RVIDT) return `export const privateEnv={DB_TYPE:process.env.DB_TYPE||"",DB_HOST:process.env.DB_HOST||"127.0.0.1",DB_PORT:parseInt(process.env.DB_PORT||"27017"),DB_NAME:process.env.DB_NAME||"sveltycms",DB_USER:process.env.DB_USER||"",DB_PASSWORD:process.env.DB_PASSWORD||"",JWT_SECRET_KEY:process.env.JWT_SECRET_KEY||"",ENCRYPTION_KEY:process.env.ENCRYPTION_KEY||"",GOOGLE_CLIENT_ID:process.env.GOOGLE_CLIENT_ID||"",GOOGLE_CLIENT_SECRET:process.env.GOOGLE_CLIENT_SECRET||"",MULTI_TENANT:process.env.MULTI_TENANT==="true"};export const __VIRTUAL__=true;`;
      return null;
    },
  };
}

/** Prevents server-only modules from leaking into client bundle */
function stubServerModulesPlugin(): Plugin {
  const rx = /\.(server\.|mongodb|mariadb|postgresql|sqlite|redis|argon2|mongoose|mysql2|pg|aws-sdk|googleapis)/i;
  const pkgs = new Set(["argon2","redis","mongoose","mongodb","postgres","mysql2","bun:sqlite","node-os-utils"]);
  const files = new Set([
    "/src/databases/db.ts","/src/databases/database-resilience.ts","/src/databases/cache/cache-service.ts",
    "/src/databases/cache/cache-warming-service.ts","/src/databases/cache/cache-metrics.ts",
    "/src/databases/config-state.ts","/src/databases/webhook-wrapper.ts","/src/databases/theme-manager.ts",
    "/src/databases/db-adapter-wrapper.ts","/src/databases/db-utils.ts","/src/databases/schemas.ts",
    "/src/databases/auth/index.ts","/src/databases/auth/session-cleanup.ts","/src/databases/auth/session-manager.ts",
    "/src/databases/auth/two-factor-auth.ts","/src/databases/auth/permissions.ts",
    "/src/databases/cache/redis-store.ts","/src/databases/cache/inmemory-store.ts",
    "/src/content/engine.server.ts","/src/content/loader.server.ts","/src/components/emails/",
    "/src/services/security/audit-service.ts","/src/databases/sqlite/adapter-core.ts",
  ]);
  return {
    name: "stub-server-modules", enforce: "pre",
    resolveId(id, _importer, options) {
      if (options?.ssr || process.env.TEST_MODE === "true") return null;
      const nid = id.replace(/\\/g, "/");
      if (pkgs.has(id) || rx.test(nid)) return "\0virtual:server-stub";
      if (files.has(nid) || [...files].some(f => nid.endsWith(f) || nid.includes(f))) return "\0virtual:server-stub";
      return null;
    },
    load(id) {
      if (id === "\0virtual:server-stub") return "export default{};export const logger={info(){},error(){},warn(){},debug(){}};";
      return null;
    },
  };
}

/** Strips unused DB adapters from production builds */
function databaseAdapterStripperPlugin(): Plugin {
  const isBuild = process.env.NODE_ENV === "production" || process.argv.includes("build");
  const isTest = process.env.TEST_MODE === "true" || process.env.VITEST === "true";
  const setupComplete = isSetupComplete();
  const compileAll = process.env.COMPILE_ALL_ADAPTERS === "true";
  if (!isBuild || isTest || !setupComplete || compileAll) return { name: "database-adapter-stripper" };

  let activeDbType = process.env.DATABASE_ENGINE || process.env.DB_TYPE;
  if (!activeDbType) {
    try {
      const c = readFileSync(path.resolve(CWD, "config/private.ts"), "utf8");
      const m = c.match(/DB_TYPE\s*[:=]\s*["'](\w+)["']/);
      if (m) activeDbType = m[1];
    } catch { activeDbType = "sqlite"; }
  }
  activeDbType = (activeDbType || "sqlite").toLowerCase();
  const map: Record<string, string[]> = { mongodb:["mariadb","postgresql","sqlite"], mariadb:["mongodb","postgresql","sqlite"], postgresql:["mongodb","mariadb","sqlite"], sqlite:["mongodb","mariadb","postgresql"] };
  const toStrip = map[activeDbType] || [];

  return {
    name: "database-adapter-stripper", enforce: "pre",
    async resolveId(id, _importer, options) {
      const resolved = await this.resolve(id, undefined, { ...options, skipSelf: true });
      const nid = (resolved?.id || id).replace(/\\/g, "/");
      if (toStrip.some(db => nid.includes(`/databases/${db}/`))) return "\0virtual:db-stub";
      return null;
    },
    load(id) { if (id === "\0virtual:db-stub") return "export default{};"; return null; },
  };
}

/** Shims Node.js APIs for browser */
function browserShimsPlugin(): Plugin {
  return {
    name: "browser-shims", enforce: "pre",
    resolveId(id) {
      if (id === "node:path") return "\0virtual:browser-shim:path";
      if (id === "node:os") return "\0virtual:browser-shim:os";
      return null;
    },
    load(id) {
      if (id === "\0virtual:browser-shim:path") return 'export default{join:(...a)=>a.join("/"),resolve:(...a)=>a.join("/"),dirname:(p)=>p.split("/").slice(0,-1).join("/"),basename:(p)=>p.split("/").pop()};';
      if (id === "\0virtual:browser-shim:os") return "export default{platform:()=>'browser',cpus:()=>[],totalmem:()=>0,freemem:()=>0};";
      return null;
    },
  };
}

/** Core CMS HMR: collections, widgets, themes, setup wizard auto-open */
function sveltyCmsPlugin(): Plugin {
  let wasPrivateConfigMissing = false;
  let compileTimeout: NodeJS.Timeout;
  let widgetTimeout: NodeJS.Timeout;

  const handleHmr = async (server: ViteDevServer, file: string) => {
    const absoluteFile = path.resolve(file);
    const isCollectionFile = absoluteFile.startsWith(paths.userCollections) && /\.(ts|js)$/.test(file);
    const isWidgetFile = absoluteFile.startsWith(paths.widgets) && (file.endsWith("index.ts") || file.endsWith(".svelte"));
    const isPrivateConfig = absoluteFile === paths.privateConfig;

    if (isPrivateConfig) {
      log.info("config/private.ts detected! Triggering restart...");
      server.ws.send("svelty:setup-complete", { timestamp: Date.now(), message: "System initialized. Restarting..." });
      setTimeout(() => server.ws.send({ type: "full-reload", path: "*" }), 500);
      return;
    }

    if (isCollectionFile) {
      clearTimeout(compileTimeout);
      compileTimeout = setTimeout(async () => {
        try {
          const { compile } = await import("./src/utils/compilation/compile");
          await compile({ userCollections: paths.userCollections, compiledCollections: paths.compiledCollections, targetFile: undefined });
          if (isSetupComplete()) {
            try {
              const { dbAdapter } = await server.ssrLoadModule(path.join(CWD, "src/databases/db.ts"));
              if (dbAdapter?.collection) {
                const { scanCompiledCollections } = await server.ssrLoadModule(path.join(CWD, "src/content/engine.server.ts"));
                const collections = await scanCompiledCollections();
                for (const schema of collections) { await dbAdapter.collection.createModel(schema); await new Promise(r => setTimeout(r, 50)); }
                log.success(`Collection models registered (${collections.length})`);
              }
            } catch (e) { log.error("Model registration failed (non-fatal):", e); }
          }
          const { generateContentTypes } = await server.ssrLoadModule(path.join(CWD, "scripts/generate-content-types.ts"));
          await generateContentTypes(server);
          server.ws.send("svelty:content-update", { timestamp: Date.now() });
        } catch (e) { log.error("Collection recompile failed:", e); }
      }, 150);
    }

    if (isWidgetFile) {
      clearTimeout(widgetTimeout);
      widgetTimeout = setTimeout(async () => {
        try {
          const { widgetStoreActions } = await server.ssrLoadModule(path.join(CWD, "src/stores/widget-store.svelte.ts"));
          await widgetStoreActions.reload();
          server.ws.send({ type: "full-reload", path: "*" });
          log.success("Widgets reloaded.");
        } catch (e) { log.error("Widget reload failed:", e); }
      }, 150);
    }

    const isThemeFile = absoluteFile.startsWith(paths.themes) && file.endsWith(".json");
    if (isThemeFile) {
      setTimeout(async () => {
        try {
          const { syncThemeFile } = await server.ssrLoadModule(path.join(CWD, "src/services/core/theme-file-sync.ts"));
          const result = await syncThemeFile(file);
          if (result.action === "created" || result.action === "updated") log.success(`Theme "${result.name}" ${result.action}.`);
          server.ws.send("svelty:theme-update", { name: result.name, timestamp: Date.now() });
        } catch (e) { log.error("Theme sync failed:", e); }
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
      server.watcher.on("all", (_event, file) => handleHmr(server, file));
      if (wasPrivateConfigMissing) {
        const orig = server.listen;
        server.listen = function (port?: number, isRestart?: boolean) {
          const result = orig.apply(this, [port, isRestart]);
          result.then(() => setTimeout(() => {
            const addr = server.httpServer?.address();
            const p = typeof addr === "object" && addr ? addr.port : 5173;
            openUrl(`http://127.0.0.1:${p}/setup`);
          }, 1000));
          return result;
        };
      }
    },
  };
}

// ── Config ─────────────────────────────────────────────────────────────────
const isBuild = process.env.NODE_ENV === "production" || process.argv.includes("build");

export default defineConfig(() => ({
  plugins: [
    uws(),
    databaseAdapterStripperPlugin(),
    testBackdoorStripperPlugin(),
    privateConfigFallbackPlugin(),
    stubServerModulesPlugin(),
    browserShimsPlugin(),
    sveltekit({
      preprocess: [vitePreprocess()],
      compilerOptions: { runes: true },
      adapter: adapter({ out: "build", precompress: true, websocket: true }),
      experimental: { remoteFunctions: true },
      alias: pathAliases,
      csrf: { trustedOrigins: ["http://127.0.0.1:4173"] },
    }),
    realtime({ typedImports: !isBuild }),
    sveltyCmsPlugin(),
    securityCheckPlugin(),
    paraglideVitePlugin({ project: "./project.inlang", outdir: "./src/paraglide" }),
    tailwindcss(),
  ],
  server: {
    fs: { allow: ["static", "."], deny: ["**/tests/**"] },
    watch: { ignored: ["**/config/private*.ts", "**/.compiledCollections/**", "**/tests/**", "**/logs/**", "**/mediaFolder/**", "**/src/content/types.ts", "**/src/paraglide/**"] },
  },
  ssr: { noExternal: SSR_NO_EXTERNAL, external: SERVER_EXTERNALS },
  define: {
    __SVELTY_SETUP_COMPLETE__: isSetupComplete(),
    global: "globalThis",
    "process.env": "{}",
  },
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: !process.env.CI,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      external: SERVER_EXTERNALS,
      onwarn(warning: any, warn: any) {
        // Third-party circular deps from mongodb, mongoose, zod — not fixable
        if (warning.code === "CIRCULAR_DEPENDENCY" && warning.message?.includes("node_modules")) return;
        // External dependencies correctly unresolved — informational
        if (warning.code === "UNRESOLVED_IMPORT" && warning.exporter?.includes("node_modules")) return;
        warn(warning);
      },
    },
  },
  optimizeDeps: {
    exclude: [...SERVER_EXTERNALS, "@src/databases/cache/cache-service"],
    include: OPTIMIZE_DEPS_INCLUDE,
    entries: ["!tests/**/*", "!**/*.server.ts", "!**/*.server.js"],
  },
  lint: { ignorePatterns: [], env: { builtin: true } },
  fmt: { ignorePatterns: ["src/live/$types.d.ts"] },
}));
