/**
 * @file scripts/check/check-hardcoded-copy.ts
 * @description
 * Static AST scanner to ensure no raw, hardcoded user-visible text enters the
 * SveltyCMS admin interface (`src/routes/(app)`). Enforces Paraglide i18n usage.
 *
 * Features:
 * - Scans `.svelte` files under `src/routes/(app)` using the authentic Svelte 5 AST compiler
 * - Identifies raw template text nodes and user-facing attributes (placeholder, aria-label, title, alt)
 * - Ignores technical tags (code, pre, svg, script, style), expressions ({...}), numbers, punctuation
 * - Supports suppression comments: `<!-- copy:ignore -->` or `<!-- hardcoded-copy:ignore -->`
 * - Supports file suppression: `<!-- copy:ignore-file -->`
 * - Exit code 0 if clean, 1 with file/line/snippet breakdown on failure in strict mode
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { parse } from "svelte/compiler";

interface Offense {
  file: string;
  line: number;
  snippet: string;
  reason: string;
}

const ALLOWED_TECHNICAL_TOKENS = new Set([
  "id",
  "uuid",
  "ok",
  "kb",
  "mb",
  "gb",
  "tb",
  "ms",
  "s",
  "ns",
  "px",
  "rem",
  "em",
  "vh",
  "vw",
  "json",
  "rest",
  "graphql",
  "sql",
  "utc",
  "am",
  "pm",
  "ip",
  "url",
  "uri",
  "http",
  "https",
  "api",
  "get",
  "post",
  "put",
  "delete",
  "patch",
  "options",
  "head",
  "oidc",
  "saml",
  "sso",
  "mfa",
  "2fa",
  "totp",
  "rbac",
  "gdpr",
  "csv",
  "zip",
  "tar",
  "gz",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "svg",
  "gif",
  "mp4",
  "webm",
  "cpu",
  "ram",
  "db",
  "pr",
  "hmr",
  "jit",
  "sdk",
  "ci",
  "cd",
  "cms",
  "ltr",
  "rtl",
  "en",
  "de",
  "fr",
  "es",
  "it",
  "ar",
  "nl",
  "pl",
  "true",
  "false",
  "null",
  "undefined",
  "nan",
  "zero",
  "one",
  "asc",
  "desc",
]);

function walkDir(dir: string, extension: string): string[] {
  let files: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === ".svelte-kit" || entry === "paraglide") continue;
        files = files.concat(walkDir(fullPath, extension));
      } else if (fullPath.endsWith(extension)) {
        files.push(fullPath);
      }
    }
  } catch {
    // Directory might not exist
  }
  return files;
}

function isTechnicalOrSymbolic(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;

  // Pure numbers, math, symbols, punctuation
  if (/^[\d\s.,:;!?_/\-+*%=&|^<>#@~`'"(){}[\]\\–—•·…]+$/.test(trimmed)) {
    return true;
  }

  // Pure hex color (e.g. #fff, #123456)
  if (/^#[0-9a-fA-F]{3,8}$/.test(trimmed)) return true;

  // Single or double character non-word
  if (trimmed.length <= 2 && !/^[A-Za-z]{2}$/.test(trimmed)) return true;

  // Pure iconify or component token
  if (/^[a-z0-9-]+:[a-z0-9-]+$/.test(trimmed)) return true;

  // Check if every word is a technical token or number
  const words = trimmed
    .toLowerCase()
    .split(/[^a-z0-9_]+/i)
    .filter(Boolean);
  if (words.length === 0) return true;

  return words.every((w) => /^\d+$/.test(w) || ALLOWED_TECHNICAL_TOKENS.has(w));
}

function getLineNumber(offset: number, lineOffsets: number[]): number {
  let low = 0;
  let high = lineOffsets.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineOffsets[mid] <= offset) {
      if (mid === lineOffsets.length - 1 || lineOffsets[mid + 1] > offset) {
        return mid + 1;
      }
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return 1;
}

export function scanFile(filePath: string): Offense[] {
  const content = readFileSync(filePath, "utf-8");
  if (
    content.includes("<!-- copy:ignore-file -->") ||
    content.includes("<!-- hardcoded-copy:ignore-file -->")
  ) {
    return [];
  }

  // Calculate line offsets for fast line lookup
  const lineOffsets: number[] = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") lineOffsets.push(i + 1);
  }

  let ast: any;
  try {
    ast = parse(content, { modern: true });
  } catch {
    return [];
  }

  const offenses: Offense[] = [];

  // 0. Check for forbidden wildcard paraglide imports: import * as m from '@src/paraglide/messages'
  const wildcardMatches = content.matchAll(
    /import\s+\*\s+as\s+\w+\s+from\s+['"][^'"]*paraglide\/messages['"]/g,
  );
  for (const match of wildcardMatches) {
    if (match.index !== undefined) {
      offenses.push({
        file: filePath,
        line: getLineNumber(match.index, lineOffsets),
        snippet: match[0],
        reason:
          "Wildcard Paraglide import forbidden. Only import used translations via named imports.",
      });
    }
  }

  function walk(node: any, parent: any) {
    if (!node || typeof node !== "object") return;

    // 1. Check raw text nodes
    if (node.type === "Text") {
      const isAttr =
        parent?.type === "Attribute" ||
        parent?.type === "StyleDirective" ||
        parent?.type === "ClassDirective";

      if (!isAttr) {
        const parentTag = parent?.name?.toLowerCase();
        if (!["code", "pre", "svg", "script", "style"].includes(parentTag)) {
          const raw = node.data?.trim();
          if (raw && !isTechnicalOrSymbolic(raw)) {
            // Check suppression before this node
            const preText = content.substring(Math.max(0, node.start - 80), node.start);
            if (
              !preText.includes("<!-- copy:ignore -->") &&
              !preText.includes("<!-- hardcoded-copy:ignore -->")
            ) {
              offenses.push({
                file: filePath,
                line: getLineNumber(node.start, lineOffsets),
                snippet: raw.length > 50 ? raw.substring(0, 47) + "..." : raw,
                reason: `Hardcoded text node in <${parent?.name || parent?.type}>. Use Paraglide.`,
              });
            }
          }
        }
      }
    }

    // 2. Check user-facing attributes: placeholder, aria-label, title, alt
    if (
      node.type === "Attribute" &&
      ["placeholder", "aria-label", "title", "alt"].includes(node.name)
    ) {
      if (Array.isArray(node.value)) {
        for (const val of node.value) {
          if (val.type === "Text") {
            const raw = val.data?.trim();
            if (raw && !isTechnicalOrSymbolic(raw)) {
              const preText = content.substring(Math.max(0, val.start - 80), val.start);
              if (
                !preText.includes("<!-- copy:ignore -->") &&
                !preText.includes("<!-- hardcoded-copy:ignore -->")
              ) {
                offenses.push({
                  file: filePath,
                  line: getLineNumber(val.start, lineOffsets),
                  snippet: `${node.name}="${raw.length > 40 ? raw.substring(0, 37) + "..." : raw}"`,
                  reason: `Hardcoded ${node.name} attribute. Use Paraglide.`,
                });
              }
            }
          }
        }
      }
    }

    for (const key of Object.keys(node)) {
      if (key === "parent") continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) walk(c, node);
      } else if (child && typeof child === "object") {
        walk(child, node);
      }
    }
  }

  if (ast.fragment) {
    walk(ast.fragment, null);
  }

  return offenses;
}

// Main CLI execution
if (import.meta.main) {
  const args = process.argv.slice(2);
  const targetDir = args.find((a) => !a.startsWith("-")) || join("src", "routes", "(app)");
  const isStrict = args.includes("--strict");

  const targetFiles = walkDir(targetDir, ".svelte");
  const allOffenses: Offense[] = [];

  for (const file of targetFiles) {
    const offenses = scanFile(file);
    allOffenses.push(...offenses);
  }

  if (allOffenses.length === 0) {
    console.log(
      `\x1b[32m✅ hardcoded-copy scanner: clean — ${targetFiles.length} files scanned in ${targetDir}\x1b[0m`,
    );
    process.exit(0);
  } else {
    const byFile = new Map<string, Offense[]>();
    for (const off of allOffenses) {
      const list = byFile.get(off.file) || [];
      list.push(off);
      byFile.set(off.file, list);
    }

    console.log(
      `\n\x1b[33m⚠️  hardcoded-copy scanner: found ${allOffenses.length} unlocalized copy instances across ${byFile.size} files:\x1b[0m\n`,
    );

    for (const [file, offenses] of byFile.entries()) {
      const rel = relative(process.cwd(), file);
      console.log(`\x1b[36m${rel}\x1b[0m (${offenses.length} items):`);
      for (const off of offenses.slice(0, 3)) {
        console.log(
          `  \x1b[90mLine ${off.line}:\x1b[0m "${off.snippet}" \x1b[31m[${off.reason.split(".")[0]}]\x1b[0m`,
        );
      }
      if (offenses.length > 3) {
        console.log(`  \x1b[90m... and ${offenses.length - 3} more\x1b[0m`);
      }
    }

    console.log(
      `\nTotal files: ${targetFiles.length} | Unlocalized files: ${byFile.size} | Offenses: ${allOffenses.length}\n`,
    );

    if (isStrict) {
      console.error(
        `\x1b[31m❌ Scanner failed in strict mode. Key these strings with Paraglide before merging.\x1b[0m`,
      );
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}
