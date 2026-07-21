/**
 * @file tests/unit/live/client-import-boundary.test.ts
 * @description Exhaustive fail-closed import boundary for **client-reachable** modules.
 *
 * Static imports of node:*, ollama, event-bus, or ai-service crash Vite client
 * bundles and surface as admin 500 pages (no page-title) in E2E.
 *
 * Strategy:
 * 1. Walk known client roots (components, stores, widgets, live, client route modules)
 * 2. Skip server-only basenames (+page.server, *.server.ts, +server.ts, …)
 * 3. Fail on forbidden static import lines
 * 4. Keep focused contracts for $live dynamic-import bridges
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** Roots that ship into browser graphs (SSR=false admin + components). */
const CLIENT_ROOTS = [
  "src/components",
  "src/stores",
  "src/widgets",
  "src/live",
  "src/routes",
  "src/paraglide",
] as const;

/**
 * Basename / path patterns that are server-only even under client roots.
 * (SvelteKit .server modules never go to the browser bundle.)
 */
const SERVER_ONLY_PATH =
  /(?:^|\/)(?:\+server|\+page\.server|\+layout\.server|\+error\.server)(?:\.|$)|(?:^|\/)[^/]+\.server\.(?:ts|js)$|(?:^|\/)hooks\.server\.(?:ts|js)$|(?:^|\/)hooks\.ws\.(?:ts|js)$|(?:^|\/)handlers\/|(?:^|\/)api\/(?:graphql\/)?(?:\+server|resolvers|loaders|rules|cost)/i;

/** Allowed server-only modules that may live next to client code (bridge files). */
const SERVER_BRIDGE_ALLOWLIST = new Set<string>([
  // none under client roots by default — event-bus lives in utils (not scanned)
]);

const FORBIDDEN_STATIC: Array<{ re: RegExp; label: string }> = [
  {
    re: /^\s*import\s+[^;]*from\s+["']node:[^"']+["']/m,
    label: 'static import from "node:*"',
  },
  {
    re: /^\s*import\s+["']node:[^"']+["']/m,
    label: 'side-effect import "node:*"',
  },
  {
    re: /^\s*import\s+[^;]*from\s+["']ollama["']/m,
    label: 'static import from "ollama"',
  },
  {
    re: /^\s*import\s+[^;]*from\s+["'](?:@utils|@src\/utils)\/event-bus["']/m,
    label: "static import of event-bus (node:events)",
  },
  {
    re: /^\s*import\s+[^;]*from\s+["']@src\/services\/core\/ai-service["']/m,
    label: "static import of ai-service (ollama/node:fs)",
  },
  {
    re: /^\s*import\s+[^;]*from\s+["'](?:fs|fs\/promises|path|crypto|child_process|net|tls|http|https|os|worker_threads|cluster|dgram|dns|readline|stream|zlib)["']/m,
    label: "static import of bare Node core module",
  },
];

const SOURCE_EXT = new Set([".ts", ".js", ".svelte", ".mts", ".cts"]);

function stripBlockComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

function stripLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      // Svelte: don't strip inside markup heuristically — still OK for import lines at top
      const idx = line.indexOf("//");
      if (idx === -1) return line;
      if (line.slice(0, idx).includes("http:") || line.slice(0, idx).includes("https:")) {
        return line;
      }
      return line.slice(0, idx);
    })
    .join("\n");
}

function walkFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name.startsWith(".")) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walkFiles(full, out);
    } else if (st.isFile() && SOURCE_EXT.has(extname(name))) {
      out.push(full);
    }
  }
  return out;
}

function toPosix(p: string): string {
  return p.replace(/\\/g, "/");
}

function isServerOnlyClientRootFile(relPosix: string): boolean {
  if (SERVER_BRIDGE_ALLOWLIST.has(relPosix)) return true;
  return SERVER_ONLY_PATH.test(relPosix);
}

function collectClientReachableFiles(): string[] {
  const files: string[] = [];
  for (const root of CLIENT_ROOTS) {
    const abs = join(ROOT, root);
    for (const full of walkFiles(abs)) {
      const rel = toPosix(relative(ROOT, full));
      if (isServerOnlyClientRootFile(rel)) continue;
      // Skip pure type shims
      if (rel.endsWith(".d.ts")) continue;
      files.push(full);
    }
  }
  return files;
}

function analyzeFile(absPath: string): string[] {
  const rel = toPosix(relative(ROOT, absPath));
  let raw: string;
  try {
    raw = readFileSync(absPath, "utf8");
  } catch {
    return [`unreadable: ${rel}`];
  }
  // For .svelte, only scan <script> blocks for imports
  let src = raw;
  if (absPath.endsWith(".svelte")) {
    const scripts = [...raw.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    src = scripts.join("\n");
  }
  src = stripLineComments(stripBlockComments(src));
  const violations: string[] = [];
  for (const { re, label } of FORBIDDEN_STATIC) {
    if (re.test(src)) {
      violations.push(`${rel}: ${label}`);
    }
  }
  return violations;
}

describe("exhaustive client-reachable import boundary", () => {
  const files = collectClientReachableFiles();

  it("discovers a non-trivial client module set", () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it("no client-reachable module statically imports Node cores / ollama / event-bus / ai-service", () => {
    const all: string[] = [];
    for (const f of files) {
      all.push(...analyzeFile(f));
    }
    if (all.length > 0) {
      expect.fail(
        `Forbidden static imports in client-reachable modules (${all.length}):\n` +
          all
            .slice(0, 40)
            .map((v) => `  - ${v}`)
            .join("\n") +
          (all.length > 40 ? `\n  … +${all.length - 40} more` : ""),
      );
    }
  });

  it("system.ts loads event-bus only via dynamic import", () => {
    const abs = join(SRC, "live/system.ts");
    expect(existsSync(abs)).toBe(true);
    const src = stripLineComments(stripBlockComments(readFileSync(abs, "utf8")));
    expect(src).toMatch(/import\s*\(\s*["']@utils\/event-bus["']\s*\)/);
    expect(src).not.toMatch(
      /^\s*import\s+\{[^}]*eventBus[^}]*\}\s+from\s+["']@utils\/event-bus["']/m,
    );
  });

  it("chat.ts loads ai-service only via dynamic import", () => {
    const abs = join(SRC, "live/chat.ts");
    expect(existsSync(abs)).toBe(true);
    const src = stripLineComments(stripBlockComments(readFileSync(abs, "utf8")));
    expect(src).toMatch(/import\s*\(\s*["']@src\/services\/core\/ai-service["']\s*\)/);
    expect(src).not.toMatch(
      /^\s*import\s+\{[^}]*aiService[^}]*\}\s+from\s+["']@src\/services\/core\/ai-service["']/m,
    );
  });

  it("collaboration-store guards chat factory before calling it", () => {
    const abs = join(SRC, "stores/collaboration-store.svelte.ts");
    expect(existsSync(abs)).toBe(true);
    const src = readFileSync(abs, "utf8");
    expect(src).toMatch(/typeof\s+chat\s*!==\s*["']function["']/);
  });
});
