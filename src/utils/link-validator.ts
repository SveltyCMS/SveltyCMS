/**
 * @file src/utils/link-validator.ts
 * @description Build-time (DEV-only) internal link validator for SveltyCMS.
 *
 * ### Hardening (audit 2026-07):
 * - SvelteKit auto-discovery: parses filesystem for routes, handles [params], [[optional]],
 *   [...catchalls], and (groups) — replaces hardcoded KNOWN_ROUTES map
 * - Multiline tag parsing: scans entire <a> boundary instead of individual lines
 * - O(n) memory Levenshtein: Int32Array row-swap replaces O(n²) 2D array
 * - Variable interpolation: handles href={"/path"} and href={'/path'}
 * - Expanded scope: scans src/lib in addition to src/routes
 *
 * ### Run:
 * ```bash
 * bun run scripts/validate-links.ts
 * ```
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { logger } from "@utils/logger";

interface LinkIssue {
  file: string;
  line: number;
  href: string;
  issue: "missing" | "suggestion" | "no-preload";
  suggestion?: string;
}

interface SvelteRoute {
  raw: string;
  regex: RegExp;
}

const VALID_ROUTES: SvelteRoute[] = [];

// ─── 1. SvelteKit Auto-Discovery Engine ────────────────────────────────────

function discoverRoutes(dir: string, basePath = ""): void {
  if (!existsSync(dir)) return;

  const entries = readdirSync(dir, { withFileTypes: true });
  let hasEndpoint = false;

  for (const entry of entries) {
    if (
      entry.name === "+page.svelte" ||
      entry.name === "+server.ts" ||
      entry.name === "+page.server.ts"
    ) {
      hasEndpoint = true;
    } else if (entry.isDirectory()) {
      discoverRoutes(join(dir, entry.name), `${basePath}/${entry.name}`);
    }
  }

  if (hasEndpoint) {
    let routeStr = basePath
      .split("/")
      .filter((segment) => !segment.startsWith("("))
      .join("/");

    if (routeStr === "") routeStr = "/";

    const pattern = routeStr
      .replace(/\[\[\.\.\.[^\]]+\]\]/g, "(?:/.*)?")
      .replace(/\[\.\.\.[^\]]+\]/g, "/.*")
      .replace(/\[\[[^\]]+\]\]/g, "([^/]*)")
      .replace(/\[[^\]]+\]/g, "([^/]+)");

    VALID_ROUTES.push({
      raw: routeStr,
      regex: new RegExp(`^${pattern}$`),
    });
  }
}

// ─── 2. Multiline Scanner ──────────────────────────────────────────────────

function scanDirectory(dir: string, issues: LinkIssue[]): void {
  if (!existsSync(dir)) return;
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      scanDirectory(full, issues);
    } else if (entry.name.endsWith(".svelte")) {
      scanFile(full, issues);
    }
  }
}

function scanFile(filePath: string, issues: LinkIssue[]): void {
  try {
    const content = readFileSync(filePath, "utf-8");
    const aTagRegex = /<a\s+([^>]+)>/gi;
    let aMatch: RegExpExecArray | null;

    while ((aMatch = aTagRegex.exec(content)) !== null) {
      const tagContent = aMatch[1];
      const lineNum = content.substring(0, aMatch.index).split("\n").length;

      const hrefRegex = /href\s*=\s*(?:["']([^"']+)["']|{?["']([^"']+)["']}?)/i;
      const hrefMatch = hrefRegex.exec(tagContent);

      if (hrefMatch) {
        const href = hrefMatch[1] || hrefMatch[2];

        if (!href || href.startsWith("http") || href.startsWith("#") || href.includes("${"))
          continue;

        const pathOnly = href.split("?")[0].split("#")[0];

        if (pathOnly.startsWith("/")) {
          const isValid = VALID_ROUTES.some((route) => route.regex.test(pathOnly));

          if (!isValid) {
            const suggestion = findClosestRoute(pathOnly);
            issues.push({
              file: relative(process.cwd(), filePath),
              line: lineNum,
              href,
              issue: suggestion ? "suggestion" : "missing",
              suggestion,
            });
          }
        }

        if (href.includes("?edit=") && !tagContent.includes("data-preload")) {
          issues.push({
            file: relative(process.cwd(), filePath),
            line: lineNum,
            href,
            issue: "no-preload",
            suggestion: 'Add data-preload="smart" for predictive preloading',
          });
        }
      }
    }
  } catch {
    logger.warn(`[LinkValidator] Unreadable file skipped: ${filePath}`);
  }
}

// ─── 3. Hyper-Fast Distance Suggestion (O(n) memory) ───────────────────────

function findClosestRoute(path: string): string | undefined {
  let best = "";
  let bestDist = Infinity;

  for (const route of VALID_ROUTES) {
    const dist = levenshtein(path, route.raw);
    if (dist < bestDist && dist < path.length / 2) {
      bestDist = dist;
      best = route.raw;
    }
  }
  return best || undefined;
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let v0 = new Int32Array(b.length + 1);
  let v1 = new Int32Array(b.length + 1);

  for (let i = 0; i < v0.length; i++) v0[i] = i;

  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a[i] === b[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
    }
    const temp = v0;
    v0 = v1;
    v1 = temp;
  }
  return v0[b.length];
}

// ─── Public API ────────────────────────────────────────────────────────────

export function validateLinks(): { issues: LinkIssue[]; ok: boolean } {
  const issues: LinkIssue[] = [];
  const srcDir = join(process.cwd(), "src");
  const routesDir = join(srcDir, "routes");

  if (!existsSync(routesDir)) {
    logger.warn("[LinkValidator] src/routes directory not found");
    return { issues: [], ok: true };
  }

  discoverRoutes(routesDir);
  scanDirectory(routesDir, issues);
  scanDirectory(join(srcDir, "lib"), issues);

  const missing = issues.filter((i) => i.issue === "missing");
  const suggestions = issues.filter((i) => i.issue === "suggestion");
  const noPreload = issues.filter((i) => i.issue === "no-preload");

  if (issues.length > 0) {
    console.log("\n🔗 Link Validation Report\n");
    if (missing.length > 0) {
      console.log(`❌ ${missing.length} broken link(s):`);
      for (const m of missing)
        console.log(`   ${m.file}:${m.line} → "${m.href}" (route not found)`);
    }
    if (suggestions.length > 0) {
      console.log(`\n💡 ${suggestions.length} link(s) with suggestions:`);
      for (const s of suggestions)
        console.log(`   ${s.file}:${s.line} → "${s.href}" — did you mean "${s.suggestion}"?`);
    }
    if (noPreload.length > 0) {
      console.log(`\n⚡ ${noPreload.length} link(s) missing data-preload:`);
      for (const n of noPreload) console.log(`   ${n.file}:${n.line} — ${n.suggestion}`);
    }
    console.log("");
  }

  return { issues, ok: missing.length === 0 };
}
