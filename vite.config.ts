/**
 * @file vite.config.ts
 * @description SveltyCMS Vite 8 + SvelteKit 3 build and dev configuration.
 *
 * Features:
 * - Dual Node/Bun adapter wrappers and post-build worker/fast-lane bundling
 * - CMS HMR for collections, widgets, themes, and fresh-install setup launch
 * - Build-time virtual stubs for test backdoors, unused DB adapters, SSR/client boundaries
 * - Vite 8 Svelte Inspector client/component patch, CSP nonce, Paraglide i18n, Tailwind v4
 */
import { exec } from "node:child_process";
import { existsSync, readFileSync, rmSync, statSync, promises as fsPromises } from "node:fs";
import { builtinModules } from "node:module";
import { platform } from "node:os";
import path from "node:path";
import nodeAdapter from "@sveltejs/adapter-node";
import bunAdapter from "svelte-adapter-bun";
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

const CWD = process.cwd();
const isBuildCmd =
  process.env.NODE_ENV === "production" ||
  process.argv.includes("build") ||
  process.argv.includes("vite-build");
const isHarnessBuildOrDev =
  process.env.TEST_MODE === "true" ||
  process.env.PLAYWRIGHT_TEST === "true" ||
  process.env.PLAYWRIGHT_TEST === "1" ||
  process.env.VITEST === "true" ||
  process.env.BUN_TEST === "true" ||
  process.env.BENCHMARK === "true" ||
  process.env.COMPILE_ALL_ADAPTERS === "true";
const isTestHarness =
  process.env.TEST_MODE === "true" ||
  process.env.VITEST === "true" ||
  process.env.PLAYWRIGHT_TEST === "true" ||
  process.env.BENCHMARK === "true" ||
  process.env.SVELTY_PRECHECK === "true" ||
  process.env.CI === "true";

// ── Adapters ────────────────────────────────────────────────────────────────
function safeBunAdapter(opts?: Parameters<typeof bunAdapter>[0]) {
  const orig = bunAdapter(opts);
  return {
    ...orig,
    async adapt(builder: Parameters<NonNullable<typeof orig.adapt>>[0]) {
      const wrappedBuilder = new Proxy(builder, {
        get(target, prop, receiver) {
          if (prop === "config") {
            const config = Reflect.get(target, prop, receiver);
            return new Proxy(config, {
              get: (cTarget, cProp, cReceiver) =>
                cProp === "kit" ? cTarget : Reflect.get(cTarget, cProp, cReceiver),
            });
          }
          if (prop === "generateManifest") {
            return () => {
              const manifestPath = path.resolve(target.getServerDirectory(), "manifest.js");
              const source = readFileSync(manifestPath, "utf8").trim();
              const prefix = "export const manifest = ";
              if (!source.startsWith(prefix) || !source.endsWith(";")) {
                throw new Error(
                  `[safeBunAdapter] unexpected manifest module shape at ${manifestPath}`,
                );
              }
              return source.slice(prefix.length, -1);
            };
          }
          return Reflect.get(target, prop, receiver);
        },
      });
      return orig.adapt(wrappedBuilder);
    },
  };
}

function safeNodeAdapter(opts?: Parameters<typeof nodeAdapter>[0]) {
  const orig = nodeAdapter(opts);
  const outDir = opts?.out ?? "build";
  return {
    ...orig,
    async adapt(builder: Parameters<NonNullable<typeof orig.adapt>>[0]) {
      if (existsSync(outDir)) {
        try {
          rmSync(outDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        } catch {
          // ignore; adapter-node will attempt rmSync as well
        }
      }
      return orig.adapt(builder);
    },
  };
}

const adapter = process.env.ADAPTER === "bun" ? safeBunAdapter : safeNodeAdapter;

// ── Shared lists & paths ────────────────────────────────────────────────────
const SERVER_EXTERNALS = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  "bun",
  "bun:sqlite",
  "bun:test",
  "bun:ffi",
  "bun:jsc",
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
  "jiti",
  "jiti/*",
  "shiki",
];

const SSR_NO_EXTERNAL = [
  "@thisux/sveltednd",
  "svelte-canvas",
  "svelte-awesome-color-picker",
  "drizzle-orm",
];
const SSR_NO_EXTERNAL_DEV = SSR_NO_EXTERNAL.filter((p) => p !== "drizzle-orm");

const OPTIMIZE_DEPS_INCLUDE = [
  "@sveltejs/kit",
  "svelte",
  "svelte/store",
  "svelte/reactivity",
  "@thisux/sveltednd",
  "svelte-canvas",
  "svelte-awesome-color-picker",
  "valibot",
];
const OPTIMIZE_DEPS_EXCLUDE = [...SERVER_EXTERNALS, "@src/databases/cache/cache-service"];

const SERVER_STUB_PACKAGES = new Set([
  "argon2",
  "redis",
  "mongoose",
  "mongodb",
  "postgres",
  "mysql2",
  "bun:sqlite",
]);
const SERVER_STUB_FILES = [
  "/src/databases/db.ts",
  "/src/databases/database-resilience.ts",
  "/src/databases/cache/cache-service.ts",
  "/src/databases/cache/cache-warming-service.ts",
  "/src/databases/cache/cache-metrics.ts",
  "/src/databases/config-state.ts",
  "/src/databases/theme-manager.ts",
  "/src/databases/db-utils.ts",
  "/src/databases/schemas.ts",
  "/src/databases/auth/index.ts",
  "/src/databases/auth/auth-service.ts",
  "/src/databases/auth/session-manager.ts",
  "/src/databases/auth/two-factor-auth.ts",
  "/src/databases/auth/permissions.ts",
  "/src/content/engine.server.ts",
  "/src/content/loader.server.ts",
  "/src/components/emails/",
  "/src/services/security/audit-service.ts",
  "/src/databases/sqlite/adapter-core.ts",
];
const SERVER_STUB_REGEX =
  /\.(mongodb|mariadb|postgresql|sqlite|redis|argon2|mongoose|mysql2|pg|aws-sdk|googleapis)/i;

const RESOLVED_ALIASES: Record<string, string> = Object.fromEntries(
  Object.entries(pathAliases).map(([key, target]) => [key, path.resolve(CWD, target)]),
);

const TRUSTED_ORIGINS = isHarnessBuildOrDev
  ? [
      ...Array.from({ length: 600 }, (_, i) => `http://127.0.0.1:${4173 + i}`),
      ...Array.from({ length: 600 }, (_, i) => `http://localhost:${4173 + i}`),
    ]
  : [];

const paths = {
  configDir: path.resolve(CWD, "config"),
  privateConfig: path.resolve(
    CWD,
    isHarnessBuildOrDev ? "config/private.test.ts" : "config/private.ts",
  ),
  userCollections: path.resolve(
    CWD,
    process.env.COLLECTIONS_DIR ||
      (isHarnessBuildOrDev ? "config/test-collections" : "config/collections"),
  ),
  compiledCollections: path.resolve(
    CWD,
    process.env.COMPILED_COLLECTIONS_DIR ||
      (isHarnessBuildOrDev ? ".compiledCollections/test-collections" : ".compiledCollections"),
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

function openUrl(url: string) {
  const plat = platform();
  const cmd =
    plat === "win32"
      ? `start "" "${url}"`
      : plat === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd);
}

async function initializeCollectionsStructure() {
  await fsPromises.mkdir(paths.compiledCollections, { recursive: true });
  const { compile } = await import("./src/utils/compilation/compile.ts");
  await compile({
    userCollections: paths.userCollections,
    compiledCollections: paths.compiledCollections,
  });
}

function shouldEnableInspector(): boolean {
  if (process.env.SVELTE_INSPECTOR_OPTIONS === "false") return false;
  if (process.env.SVELTY_INSPECTOR === "0" || process.env.SVELTY_INSPECTOR === "false")
    return false;
  if (process.env.SVELTY_INSPECTOR === "1" || process.env.SVELTY_INSPECTOR === "true") return true;
  return !isBuildCmd && !isTestHarness;
}

// ── Vite Plugins ────────────────────────────────────────────────────────────

/** Strips test backdoors in production and stubs TipTap/ProseMirror in SSR. */
function testBackdoorStripperPlugin(): Plugin {
  return {
    name: "test-backdoor-stripper",
    enforce: "pre",
    resolveId(id, _importer, options) {
      if (!id.includes("/") && !id.includes("\\")) return null;
      const norm = id.replace(/\\/g, "/");
      if (options?.ssr && (norm.includes("tiptap") || norm.includes("prosemirror"))) {
        return `\0virtual:ssr-stub:${id}`;
      }
      if (
        process.env.NODE_ENV === "production" &&
        !process.env.TEST_MODE &&
        process.env.COMPILE_ALL_ADAPTERS !== "true" &&
        (norm.includes("handlers/testing") || norm.includes("src/hooks/handle-test-isolation"))
      ) {
        return "\0virtual:test-noop";
      }
      return null;
    },
    load(id) {
      if (id === "\0virtual:test-noop") {
        return {
          code: 'export const POST=()=>new Response("Not Found",{status:404});export const handleTestIsolation=({event,resolve})=>resolve(event);export const SVELTY_TEST_BACKDOOR_STRIPPED=true;export default{};',
          map: null,
        };
      }
      if (id.startsWith("\0virtual:ssr-stub:")) {
        return {
          code: "export const createEditor=()=>({});const noop=()=>({});export default new Proxy({},{get:()=>noop});",
          map: null,
        };
      }
      return null;
    },
  };
}

/** Redirects private config in test harnesses and provides virtual fallback when missing. */
function privateConfigFallbackPlugin(): Plugin {
  const VID = "@config/private";
  const VIDT = "@config/private.test";
  const RVID = `\0${VID}`;
  const RVIDT = `\0${VIDT}`;
  const cache = new Map<string, string | null>();
  const harness =
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
      if (
        harness &&
        (id === VID || nid.endsWith("config/private.ts") || nid.endsWith("config/private"))
      ) {
        const tp = path.resolve(CWD, "config/private.test.ts");
        result = existsSync(tp) ? tp : RVID;
      } else if (nid.endsWith("config/private") || nid.endsWith("config/private.ts")) {
        result = existsSync(path.resolve(CWD, "config/private.ts")) ? null : RVID;
      } else if (nid.endsWith("config/private.test") || nid.endsWith("config/private.test.ts")) {
        result = existsSync(path.resolve(CWD, "config/private.test.ts")) ? null : RVIDT;
      }
      cache.set(id, result);
      return result;
    },
    load(id) {
      if (id === RVID || id === RVIDT) {
        return {
          code: `export const privateEnv={DB_TYPE:process.env.DB_TYPE||"",DB_HOST:process.env.DB_HOST||"127.0.0.1",DB_PORT:parseInt(process.env.DB_PORT||"27017"),DB_NAME:process.env.DB_NAME||"sveltycms",DB_USER:process.env.DB_USER||"",DB_PASSWORD:process.env.DB_PASSWORD||"",JWT_SECRET_KEY:process.env.JWT_SECRET_KEY||"",ENCRYPTION_KEY:process.env.ENCRYPTION_KEY||"",GOOGLE_CLIENT_ID:process.env.GOOGLE_CLIENT_ID||"",GOOGLE_CLIENT_SECRET:process.env.GOOGLE_CLIENT_SECRET||"",MULTI_TENANT:process.env.MULTI_TENANT==="true"};export const __VIRTUAL__=true;`,
          map: null,
        };
      }
      return null;
    },
  };
}

/** Prevents server-only modules from entering the client bundle. */
function stubServerModulesPlugin(): Plugin {
  return {
    name: "stub-server-modules",
    enforce: "pre",
    resolveId(id, _importer, options) {
      if (options?.ssr || process.env.TEST_MODE === "true") return null;
      const nid = id.replace(/\\/g, "/");
      if (
        nid.includes("/src/routes/") ||
        nid.includes("/.svelte-kit/") ||
        /(?:^|\/)\+?(?:page|layout|server|error)(?:\.[^/]+)?$/.test(nid) ||
        nid.includes("proxy+")
      ) {
        return null;
      }
      if (SERVER_STUB_PACKAGES.has(id) || SERVER_STUB_REGEX.test(nid)) {
        return "\0virtual:server-stub";
      }
      if (
        /\.server\.(ts|js|svelte)(?=\?|$)/.test(nid) &&
        nid.includes("/src/") &&
        !nid.includes("/routes/")
      ) {
        return "\0virtual:server-stub";
      }
      if (SERVER_STUB_FILES.some((f) => nid.includes(f))) {
        return "\0virtual:server-stub";
      }
      return null;
    },
    load(id) {
      if (id === "\0virtual:server-stub") {
        return {
          code: "export default{};export const logger={info(){},error(){},warn(){},debug(){}};",
          map: null,
        };
      }
      return null;
    },
  };
}

/** Stubs `(app)` admin routes when `SVELTY_API_ONLY=1` is set. */
function apiOnlyRouteStubPlugin(): Plugin {
  return {
    name: "api-only-route-stub",
    enforce: "pre",
    load(id) {
      const nid = id.replace(/\\/g, "/");
      if (!nid.includes("/routes/(app)/")) return null;
      const match = nid.match(/\/\+(page|layout|error)(?:\.server)?\.(svelte|ts|js)$/);
      if (!match) return null;
      const [, type, ext] = match;
      if (ext === "svelte") {
        const code =
          type === "layout"
            ? "<script>\nlet { children } = $props();\n</script>\n{@render children?.()}"
            : "<script>\n</script>\n";
        return { code, map: null };
      }
      if (nid.endsWith("+server.ts") || nid.endsWith("+server.js")) {
        return {
          code: "function gone() { return new Response('API-only build', { status: 404 }); }\nexport { gone as GET, gone as POST, gone as PUT, gone as PATCH, gone as DELETE };",
          map: null,
        };
      }
      if (nid.endsWith("+page.server.ts") || nid.endsWith("+page.server.js")) {
        return {
          code: "export function load() { return { status: 404 }; }\nexport const actions = {};",
          map: null,
        };
      }
      return {
        code:
          type === "page"
            ? "export function load() { return { status: 404 }; }"
            : "export function load() { return {}; }",
        map: null,
      };
    },
  };
}

/** Strips unused DB adapters from single-engine production builds. */
function databaseAdapterStripperPlugin(): Plugin {
  const isTest = process.env.TEST_MODE === "true" || process.env.VITEST === "true";
  if (!isBuildCmd || isTest || !isSetupComplete() || process.env.COMPILE_ALL_ADAPTERS === "true") {
    return { name: "database-adapter-stripper" };
  }

  let activeDbType = process.env.DATABASE_ENGINE || process.env.DB_TYPE;
  if (!activeDbType) {
    try {
      const c = readFileSync(path.resolve(CWD, "config/private.ts"), "utf8");
      activeDbType = c.match(/DB_TYPE\s*[:=]\s*["'](\w+)["']/)?.[1] ?? "sqlite";
    } catch {
      activeDbType = "sqlite";
    }
  }
  const engines = ["sqlite", "postgresql", "mariadb", "mongodb"];
  const active = (activeDbType || "sqlite").toLowerCase();
  const toStrip = engines.includes(active) ? engines.filter((db) => db !== active) : [];
  const entryFiles: Record<string, string> = {
    sqlite: "sqlite/sqlite-adapter",
    postgresql: "postgresql/postgres-adapter",
    mariadb: "mariadb/mariadb-adapter",
    mongodb: "mongodb/mongo-db-adapter",
  };
  const classNames: Record<string, string> = {
    sqlite: "SQLiteAdapter",
    postgresql: "PostgreSQLAdapter",
    mariadb: "MariaDBAdapter",
    mongodb: "MongoDBAdapter",
  };

  return {
    name: "database-adapter-stripper",
    enforce: "pre",
    async resolveId(id, _importer, options) {
      const resolved = await this.resolve(id, undefined, { ...options, skipSelf: true });
      const nid = (resolved?.id || id).replace(/\\/g, "/");
      for (const dbName of toStrip) {
        if (
          (options?.ssr && nid.includes(entryFiles[dbName]!)) ||
          (!options?.ssr && nid.includes(`/databases/${dbName}/`))
        ) {
          return `\0virtual:db-stub:${dbName}`;
        }
      }
      return null;
    },
    load(id) {
      if (!id.startsWith("\0virtual:db-stub")) return null;
      const dbName = id.split(":")[2] || "unknown";
      const className = classNames[dbName] || "DatabaseAdapter";
      return {
        code: `export class ${className} { constructor() { throw new Error("Adapter '${dbName}' was stripped in this single-DB production build. Set COMPILE_ALL_ADAPTERS=true or configure DB_TYPE to build with this engine."); } } export default {};`,
        map: null,
      };
    },
  };
}

/** Shims Node builtins and jsdom out of browser bundles. */
function browserShimsPlugin(): Plugin {
  return {
    name: "browser-shims",
    enforce: "pre",
    resolveId(id, _importer, options) {
      if (options?.ssr) return null;
      if (id === "node:path" || id === "path") return "\0virtual:browser-shim:path";
      if (id === "node:os" || id === "os") return "\0virtual:browser-shim:os";
      if (id === "jsdom") return "\0virtual:browser-shim:jsdom";
      return null;
    },
    load(id) {
      if (id === "\0virtual:browser-shim:path") {
        return {
          code: `const join=(...a)=>a.join("/");const resolve=(...a)=>a.join("/");const dirname=(p)=>p.split("/").slice(0,-1).join("/")||".";const basename=(p)=>p.split("/").pop()||"";export{join,resolve,dirname,basename};export default{join,resolve,dirname,basename};`,
          map: null,
        };
      }
      if (id === "\0virtual:browser-shim:os") {
        return {
          code: `const platform=()=>"browser";const cpus=()=>[];const totalmem=()=>0;const freemem=()=>0;export{platform,cpus,totalmem,freemem};export default{platform,cpus,totalmem,freemem};`,
          map: null,
        };
      }
      if (id === "\0virtual:browser-shim:jsdom") {
        return {
          code: `// @ts-nocheck\nexport class JSDOM { constructor() { this.window = {}; } }\nexport { JSDOM as default };`,
          map: null,
        };
      }
      return null;
    },
  };
}

/**
 * Patches Inspector.svelte pre-compile (fixes toggle-button bubble race with
 * `svelte:window onclick={disable}`, z-index, and capture-phase keydown).
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
        if (next.includes("onclick={disable}") && !next.includes("svelty-inspector-click-patch")) {
          next = next.replace(
            "onclick={disable}",
            `/* svelty-inspector-click-patch */ ${WINDOW_CLICK_FIX}`,
          );
        }
        if (
          next.includes("onclick={() => toggle()}") &&
          !next.includes("svelty-inspector-toggle-patch")
        ) {
          next = next.replace(
            "onclick={() => toggle()}",
            "/* svelty-inspector-toggle-patch */ onclick={(e) => { e.stopPropagation(); e.preventDefault(); toggle(); }}",
          );
        }
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
        if (
          next.includes("document.body.addEventListener('keydown', keydown)") &&
          !next.includes("svelty-inspector-key-patch")
        ) {
          next = next.replace(
            /document\.body\.addEventListener\('keydown',\s*keydown\);\s*if\s*\(options\.holdMode\)\s*\{\s*document\.body\.addEventListener\('keyup',\s*keyup\);\s*\}/,
            "// svelty-inspector-key-patch\nwindow.addEventListener('keydown', keydown, true);\nif (options.holdMode) {\n\twindow.addEventListener('keyup', keyup, true);\n}",
          );
          next = next.replace(
            /document\.body\.removeEventListener\('keydown',\s*keydown\);\s*if\s*\(options\.holdMode\)\s*\{\s*document\.body\.removeEventListener\('keyup',\s*keyup\);\s*\}/,
            "window.removeEventListener('keydown', keydown, true);\nif (options.holdMode) {\n\twindow.removeEventListener('keyup', keyup, true);\n}",
          );
        }
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

/** Vite 8 serves `/@vite/client` via `bundledDevClient.mjs`, which upstream inspector misses. */
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
      if (!isViteClient || code.includes("virtual:svelte-inspector-path:load-inspector")) return;
      return { code: `${code}${INJECT}`, map: null };
    },
  };
}

/** Core CMS HMR for collections, widgets, themes, and fresh-install setup auto-open. */
function sveltyCmsPlugin(): Plugin {
  let wasPrivateConfigMissing = false;
  let compileTimeout: NodeJS.Timeout;
  let widgetTimeout: NodeJS.Timeout;
  const pendingCollectionFiles = new Set<string>();
  let pendingCollectionDelete = false;

  const handleHmr = async (server: ViteDevServer, event: string, file: string) => {
    const absoluteFile = path.resolve(file);
    if (absoluteFile === paths.privateConfig) {
      log.info("config/private.ts detected! Triggering restart...");
      server.ws.send("svelty:setup-complete", {
        timestamp: Date.now(),
        message: "System initialized. Restarting...",
      });
      setTimeout(() => server.ws.send({ type: "full-reload", path: "*" }), 500);
      return;
    }

    const underCollections =
      absoluteFile === paths.userCollections ||
      absoluteFile.startsWith(paths.userCollections + path.sep);
    const isCollectionFile = underCollections && /\.(ts|js)$/.test(absoluteFile);
    let isCollectionDir = false;
    if (
      underCollections &&
      absoluteFile !== paths.userCollections &&
      !isCollectionFile &&
      (event === "addDir" || event === "unlinkDir" || event === "add" || event === "unlink")
    ) {
      if (event === "addDir" || event === "unlinkDir" || event === "unlink") {
        isCollectionDir = true;
      } else {
        try {
          isCollectionDir = statSync(absoluteFile).isDirectory();
        } catch {
          isCollectionDir = false;
        }
      }
    }

    if (isCollectionFile || isCollectionDir) {
      if (isCollectionFile) pendingCollectionFiles.add(absoluteFile);
      if (event === "unlink" || event === "unlinkDir" || isCollectionDir)
        pendingCollectionDelete = true;

      clearTimeout(compileTimeout);
      compileTimeout = setTimeout(async () => {
        const files = Array.from(pendingCollectionFiles);
        const fullBuild = pendingCollectionDelete || files.length !== 1;
        pendingCollectionFiles.clear();
        pendingCollectionDelete = false;

        try {
          // Use ssrLoadModule so Vite resolves path aliases inside server modules.
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

    if (
      absoluteFile.startsWith(paths.widgets) &&
      (file.endsWith("index.ts") || file.endsWith(".svelte"))
    ) {
      clearTimeout(widgetTimeout);
      widgetTimeout = setTimeout(async () => {
        try {
          const { widgets } = await server.ssrLoadModule(
            path.join(CWD, "src/stores/widget-store.svelte.ts"),
          );
          await widgets.reload();
          server.ws.send({ type: "full-reload", path: "*" });
          log.success("Widgets reloaded.");
        } catch (e) {
          log.error("Widget reload failed:", e);
        }
      }, 150);
    }

    if (
      absoluteFile.startsWith(paths.dashboardWidgets) &&
      (file.endsWith(".svelte") || file.endsWith("widget.json") || file.endsWith(".mdx"))
    ) {
      clearTimeout(widgetTimeout);
      widgetTimeout = setTimeout(() => {
        server.ws.send({ type: "full-reload", path: "*" });
        log.success("Dashboard widgets reloaded.");
      }, 150);
    }

    if (absoluteFile.startsWith(paths.themes) && file.endsWith(".json")) {
      setTimeout(async () => {
        try {
          const { syncThemeFile } = await server.ssrLoadModule(
            path.join(CWD, "src/services/core/theme-file-sync.ts"),
          );
          const result = await syncThemeFile(file);
          if (result.action === "created" || result.action === "updated") {
            log.success(`Theme "${result.name}" ${result.action}.`);
          }
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

/** Copies worker threads, bundles Yjs/background services, and patches adapter output. */
function postBuildPlugin(): Plugin {
  async function patchFile(
    relPath: string,
    replacements: Array<{ pattern: RegExp; replacement: string; warnIfMissing?: string }>,
  ) {
    const filePath = path.resolve(CWD, relPath);
    if (!existsSync(filePath)) return;
    let code = readFileSync(filePath, "utf8");
    let changed = false;
    for (const { pattern, replacement, warnIfMissing } of replacements) {
      if (pattern.test(code)) {
        code = code.replace(pattern, replacement);
        changed = true;
      } else if (warnIfMissing) {
        log.warn(`${warnIfMissing} in ${relPath}`);
      }
    }
    if (changed) {
      await fsPromises.writeFile(filePath, code);
      log.info(`patched ${relPath}`);
    }
  }

  return {
    name: "svelty-post-build",
    apply: "build",
    buildApp: {
      order: "post",
      async handler() {
        const workerDest = path.resolve(CWD, "build/server/chunks/module-worker.server.ts");
        try {
          await fsPromises.mkdir(path.dirname(workerDest), { recursive: true });
          await fsPromises.copyFile(
            path.resolve(CWD, "src/content/module-worker.server.ts"),
            workerDest,
          );
          log.info("Copied module-worker.server.ts to build output");
        } catch (e: unknown) {
          log.warn(`Failed to copy worker file: ${(e as Error).message}`);
        }

        const { build: esbuild, transform } = await import("esbuild");
        const { compileModule } = await import("svelte/compiler");
        const logLevel = process.argv.includes("--debug") ? "info" : "warning";

        await esbuild({
          entryPoints: [path.resolve(CWD, "src/services/collaboration/yjs-sync-server.ts")],
          bundle: true,
          platform: "node",
          format: "esm",
          minify: true,
          treeShaking: true,
          target: "node24",
          outfile: path.resolve(CWD, "build/yjs-sync-server.js"),
          external: ["ws", "yjs", "y-protocols", "lib0"],
          alias: { "@utils": path.resolve(CWD, "src/utils") },
          logLevel,
        });
        log.info("Bundled collaboration server: build/yjs-sync-server.js");

        await esbuild({
          entryPoints: {
            "background-worker": path.resolve(CWD, "src/services/background/background-entry.ts"),
            "background-supervisor": path.resolve(
              CWD,
              "src/services/background/background-supervisor.ts",
            ),
          },
          bundle: true,
          platform: "node",
          format: "esm",
          minify: true,
          treeShaking: true,
          target: "node24",
          outdir: path.resolve(CWD, "build"),
          packages: "external",
          plugins: [
            {
              name: "compile-svelte-runes-modules",
              setup(build) {
                build.onLoad({ filter: /\.svelte\.[cm]?[jt]s$/ }, async (args) => {
                  const stripped = await transform(readFileSync(args.path, "utf8"), {
                    loader: args.path.endsWith(".ts") ? "ts" : "js",
                    format: "esm",
                    target: "esnext",
                  });
                  const compiled = compileModule(stripped.code, {
                    filename: args.path,
                    generate: "server",
                    dev: false,
                  });
                  return { contents: compiled.js.code, loader: "js" };
                });
              },
            },
          ],
          alias: {
            "$app/env": path.resolve(CWD, "src/services/background/background-runtime-env.ts"),
            "@src": path.resolve(CWD, "src"),
            "@utils": path.resolve(CWD, "src/utils"),
            "@widgets": path.resolve(CWD, "src/widgets"),
          },
          logLevel,
        });
        log.info("Bundled background worker & supervisor");

        await patchFile("build/adapter-node.js", [
          {
            pattern: /export const origin = undefined;/,
            replacement: "export const origin = process.env.ORIGIN;",
          },
        ]);
        await patchFile("build/server/adapter-node-handler.js", [
          {
            pattern: /u\("BODY_SIZE_LIMIT","512K"\)/,
            replacement: 'u("BODY_SIZE_LIMIT","100M")',
          },
        ]);
        await patchFile("build/handler.js", [
          {
            pattern: /(?:const|var)\s+websocket\s*=\s*server\.websocket\(\);/,
            replacement:
              "const websocket = typeof server.websocket === 'function' ? server.websocket() : null;",
          },
        ]);
        await patchFile("build/server/adapter-index.js", [
          {
            pattern: /e\.on\("request"/,
            replacement:
              'e.on("connection",__svelty_socket=>__svelty_socket.setNoDelay(!0));e.on("request"',
            warnIfMissing: "adapter-node entry patch: http.createServer pattern not found",
          },
          {
            pattern: /h\(a,s,\(\)=>\{s\.statusCode=404,s\.end\(\)\}\)/,
            replacement:
              '(()=>{const __svelty_next=()=>{s.statusCode=404;s.end()};const __svelty_lanes=globalThis["__SVELTY_FAST_LANES__"];const m=a.method;if(__svelty_lanes&&(m==="GET"||m==="HEAD"||m==="POST"||m==="PATCH"||m==="PUT")&&a.headers["x-fast-lane"]!=="off"){let __svelty_rb;if(m==="POST"||m==="PATCH"||m==="PUT"){__svelty_rb=()=>new Promise((resolve,reject)=>{const chunks=[];let size=0;a.on("data",c=>{size+=c.length;if(size>15728640){reject(new Error("Payload too large"));return}chunks.push(c)});a.on("end",()=>resolve(chunks.length===1?chunks[0]:Buffer.concat(chunks)));a.on("error",reject)})};__svelty_lanes({method:m,url:a.url||"/",origin:process.env.ORIGIN||("http://"+(a.headers.host||"localhost")),headers:a.headers,clientAddress:a.socket?.remoteAddress||"127.0.0.1",readBody:__svelty_rb}).then(__svelty_out=>{if(!__svelty_out){h(a,s,__svelty_next);return}s.writeHead(__svelty_out.status,__svelty_out.headers);s.end(__svelty_out.body)}).catch(()=>h(a,s,__svelty_next));return}h(a,s,__svelty_next)})()',
            warnIfMissing: "adapter-node entry patch: request-listener pattern not found",
          },
        ]);
      },
    },
  };
}

// ── Config ──────────────────────────────────────────────────────────────────
export default defineConfig(() => {
  const enableInspector = shouldEnableInspector();

  return {
    plugins: [
      tailwindcss() as any,
      ...(process.env.SVELTY_API_ONLY === "1" ? [apiOnlyRouteStubPlugin()] : []),
      databaseAdapterStripperPlugin(),
      testBackdoorStripperPlugin(),
      privateConfigFallbackPlugin(),
      stubServerModulesPlugin(),
      browserShimsPlugin(),
      sveltekit({
        preprocess: [vitePreprocess()],
        compilerOptions: { runes: true },
        inspector: enableInspector
          ? {
              toggleKeyCombo: "alt-x",
              holdMode: false,
              showToggleButton: "always",
              toggleButtonPos: "bottom-right",
            }
          : false,
        adapter: adapter({ out: "build", precompress: platform() !== "win32" }),
        experimental: { remoteFunctions: true },
        csrf: { trustedOrigins: TRUSTED_ORIGINS },
        csp: {
          mode: "nonce",
          directives: {
            "default-src": ["self"],
            "script-src": ["self", "strict-dynamic", "wasm-unsafe-eval"],
            "style-src": ["self", "unsafe-inline"],
            "img-src": ["self", "data:", "blob:", "https:"],
            "font-src": ["self", "data:", "https:"],
            "connect-src": ["self", "https:", "wss:"],
            "media-src": ["self", "data:", "blob:", "https:"],
            "frame-src": ["self", "data:", "blob:", "https:"],
            "worker-src": ["self", "blob:"],
            "object-src": ["none"],
            "base-uri": ["self"],
            "form-action": ["self"],
            "frame-ancestors": ["none"],
          },
        },
      }),
      ...(enableInspector
        ? [svelteInspectorInjectPlugin(), svelteInspectorClientInjectPlugin()]
        : []),
      sveltyCmsPlugin(),
      securityCheckPlugin(),
      postBuildPlugin(),
      paraglideVitePlugin({
        project: "./project.inlang",
        outdir: "./src/paraglide",
        outputStructure: "message-modules",
        emitTsDeclarations: true,
        isServer: "import.meta.env.SSR",
      }),
    ],
    resolve: {
      alias: RESOLVED_ALIASES,
      extensions: [".ts", ".js", ".json"],
    },
    server: {
      port: 5173,
      strictPort: true,
      fs: { allow: ["static", "."], deny: ["**/tests/**"] },
      watch: {
        ignored: [
          "**/config/private*.ts",
          "**/.compiledCollections/**",
          "**/tests/**",
          "**/tests/e2e/.auth/**",
          "**/docs/**",
          "**/docker/**",
          "**/*.db*",
          "**/test-media/**",
          "**/.vitest/**",
          "**/.zed/**",
          "**/logs/**",
          "**/mediaFolder/**",
          "**/src/content/types.ts",
          "**/project.inlang/cache/**",
        ],
      },
    },
    ssr: {
      noExternal: isBuildCmd ? SSR_NO_EXTERNAL : SSR_NO_EXTERNAL_DEV,
      external: SERVER_EXTERNALS,
    },
    define: {
      __SVELTY_SETUP_COMPLETE__: isSetupComplete(),
      __IS_TEST__:
        process.env.TEST_MODE === "true" ||
        process.env.PLAYWRIGHT_TEST === "true" ||
        process.env.VITEST === "true",
      __IS_BENCHMARK__:
        process.env.BENCHMARK === "true" || process.env.COMPILE_ALL_ADAPTERS === "true",
      global: "globalThis",
    },
    build: {
      target: "esnext",
      minify: "esbuild" as const,
      sourcemap: process.env.BUILD_SOURCEMAP === "false" ? false : !process.env.CI,
      chunkSizeWarningLimit: 1700,
      checks: { pluginTimings: false },
      rollupOptions: {
        treeshake: {
          moduleSideEffects: "no-external" as const,
          propertyReadSideEffects: false as const,
          annotations: true,
          unknownGlobalSideEffects: false,
        },
        output: {
          manualChunks(id: string) {
            if (id.includes("/src/plugins/index.ts") || id.includes("\\src\\plugins\\index.ts")) {
              return "plugin-shell";
            }
            return undefined;
          },
        },
      },
    },
    optimizeDeps: {
      exclude: OPTIMIZE_DEPS_EXCLUDE,
      include: OPTIMIZE_DEPS_INCLUDE,
      entries: ["!tests/**/*", "!**/*.server.ts", "!**/*.server.js"],
    },
    lint: { ignorePatterns: [], env: { builtin: true } },
    fmt: { ignorePatterns: [] },
  };
});
