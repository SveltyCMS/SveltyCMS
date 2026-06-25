/**
 * @file tests/lint-docs.ts
 * @description Semantic + Compliance Linter for SveltyCMS Documentation
 *
 * Supercharged Smart Mode & Autofixer (2026):
 * - Heading stack + missing H1 detection
 * - Duplicate heading detection (ignores code blocks) with de-duplication suggestions
 * - YAML frontmatter syntax validation & AUTOFIX
 * - Heading Anchor validation (scans target docs for missing #hash link targets)
 * - Broken relative image path checks & AUTOFIX (validates assets exist, fixes backslashes)
 * - Frontmatter `path` consistency validation & AUTOFIX
 * - Alt text placeholder AUTOFIX for empty alt properties
 * - Fuzzy broken link routing using Levenshtein distance
 * - Intelligent description + complexity warnings
 * - Improved Mermaid diagram validation
 * - Readability guards (overly long paragraphs, placeholder leaks)
 * - Full EU/DE comparative advertising compliance & AUTOFIX
 * - MDX-specific JSX component tag-matching validation
 * - Optional async external URL validator
 * - Smart subset routing: filters targets dynamically when called via lint-staged
 *
 * Usage:
 *   bun run lint:docs                 # Check all docs
 *   bun run lint:docs --fix           # Check + autofix
 *   bun run lint:docs --dry-run       # Check without writing
 *   bun run lint:docs --check-external # Probe external link reachability
 *   bun run lint:docs file.md         # Check specific file(s)
 */

import fs from "node:fs";
import path from "node:path";

const DOCS_DIR = path.join(process.cwd(), "docs");
const STATIC_DIR = path.join(process.cwd(), "static", "docs");
const MAX_PARAGRAPH_LENGTH = 1000;

// 🇪🇺 EU Compliance
const COMPETITOR_NAMES = [
  "Payload",
  "Strapi",
  "Directus",
  "Sanity",
  "Contentful",
  "WordPress",
  "Drupal",
  "Joomla",
  "Sveltia",
  "NodeHive",
  "Hygraph",
  "Ghost",
  "Keystone",
];

const DISCREDITING_PATTERNS: Array<{
  pattern: RegExp;
  message: string;
  suggestion?: string;
}> = [
  {
    pattern: /\bsuffer(?:s|ing)?\s+from\b/gi,
    message: 'Discrediting: "suffer(s/ing) from"',
    suggestion: 'Use "faces challenges with"',
  },
  {
    pattern: /\bcannot\s+(?:compete|match|handle|perform|keep up)/gi,
    message: 'Discrediting: "cannot compete/match"',
    suggestion: "Use architectural descriptions",
  },
  {
    pattern: /\bfails?\s+to\b/gi,
    message: 'Discrediting: "fail(s) to"',
    suggestion: 'Use "does not currently"',
  },
  {
    pattern: /\babsent\s+in\s+/gi,
    message: 'Discrediting: "absent in [competitor]"',
    suggestion: 'Use "not observed in public documentation of"',
  },
  {
    pattern: /\boutperforms?\s+(?:all\s+)?(?:competitors?|rivals?|other)/gi,
    message: 'Discrediting: "outperforms competitors"',
    suggestion: "Cite benchmarks with methodology",
  },
];

const ABSOLUTE_PATTERNS: Array<{
  pattern: RegExp;
  message: string;
  suggestion?: string;
}> = [
  {
    pattern: /\bonly\s+CMS\b/gi,
    message: 'Unverifiable: "only CMS"',
    suggestion: 'Use "one of the few"',
  },
  {
    pattern: /\bindustry-?first\b/gi,
    message: 'Unverifiable: "industry-first"',
    suggestion: 'Use "not publicly documented by other platforms as of [date]"',
  },
  {
    pattern: /\b(?:fastest|best|leading|top|ultimate)\s+CMS\b/gi,
    message: "Unverifiable superlative",
    suggestion: "Cite specific benchmark data",
  },
  {
    pattern: /\bno\s+competitor\s+offers?\b/gi,
    message: 'Unverifiable: "no competitor offers"',
    suggestion: 'Use "no competitor is known to offer (based on public docs)"',
  },
  {
    pattern: /\bsuperior\s+(?:to|than)\b/gi,
    message: "Unverifiable superiority claim",
    suggestion: "Compare specific measurable features",
  },
];

const REQUIRED_QUALIFIERS = [
  /based on publicly available/i,
  /as of (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/i,
  /to our knowledge/i,
  /we have not observed/i,
  /not publicly documented/i,
  /tested on/i,
  /EU Directive 2006/i,
  /comparative advertising/i,
];

// --- Helpers ---
let totalFiles = 0,
  competitorDocs = 0,
  totalWordCount = 0;
const errorsByCategory: Record<string, number> = {};
const warningsByCategory: Record<string, number> = {};
const headingAnchorCache = new Map<string, Set<string>>();

const args = process.argv.slice(2);
const shouldAutofix = args.includes("--fix");
const isDryRun = args.includes("--dry-run");
const checkExternal = args.includes("--check-external");
const isVerbose = args.includes("--verbose");
const targetFilesOnly = args.filter(
  (a) => !a.startsWith("-") && (a.endsWith(".md") || a.endsWith(".mdx")),
);
const fileIndex = buildFileIndex(DOCS_DIR);

function addError(cat: string, rel: string, msg: string, sug?: string) {
  errorsByCategory[cat] = (errorsByCategory[cat] || 0) + 1;
  console.error(`❌ [${rel}] ${cat}: ${msg}`);
  if (sug) console.error(`   💡 ${sug}`);
}

function addWarning(cat: string, rel: string, msg: string, sug?: string) {
  warningsByCategory[cat] = (warningsByCategory[cat] || 0) + 1;
  console.warn(`⚠️  [${rel}] ${cat}: ${msg}`);
  if (sug) console.warn(`   💡 ${sug}`);
}

function parseFrontmatter(content: string): { fm: string; body: string } {
  if (!content.startsWith("---")) return { fm: "", body: content };
  // Find closing --- on its own line, not inline/in-body ---
  const lines = content.split("\n");
  for (let i = 1; i < lines.length; i++) {
    if (/^---\s*$/.test(lines[i])) {
      return {
        fm: lines.slice(1, i).join("\n").trim(),
        body: lines.slice(i + 1).join("\n"),
      };
    }
  }
  return { fm: "", body: content };
}

function walk(dir: string, cb: (fp: string) => void) {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith(".")) walk(full, cb);
    else if (e.name.endsWith(".md") || e.name.endsWith(".mdx")) cb(full);
  }
}

function buildFileIndex(docsDir: string): Set<string> {
  const idx = new Set<string>();
  walk(docsDir, (fp) => {
    const rel = path.relative(docsDir, fp).replace(/\\/g, "/");
    const base = rel.replace(/\.(mdx|md)$/, "");
    [rel, base, `/docs/${rel}`, `/docs/${base}`, `docs/${rel}`, `docs/${base}`].forEach((p) =>
      idx.add(p),
    );
  });
  // Index test files + plugin docs
  for (const [dir, exts] of [
    [path.join(process.cwd(), "tests"), [".ts"]],
    [path.join(process.cwd(), "src", "plugins"), [".md", ".mdx"]],
    [path.join(process.cwd(), "src"), [".ts", ".svelte"]],
  ] as const) {
    if (!fs.existsSync(dir)) continue;
    const recurse = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name);
        if (e.isDirectory() && !e.name.startsWith(".")) recurse(f);
        else if (exts.some((x) => e.name.endsWith(x)))
          idx.add(path.relative(process.cwd(), f).replace(/\\/g, "/"));
      }
    };
    recurse(dir);
  }
  return idx;
}

function hasStaticAsset(link: string): boolean {
  const clean = link.replace(/^\/?(docs|static)\//, "");
  try {
    fs.accessSync(path.join(STATIC_DIR, clean));
    return true;
  } catch {
    /* */
  }
  try {
    fs.accessSync(path.join(process.cwd(), "static", clean));
    return true;
  } catch {
    /* */
  }
  return false;
}

function countFencedBlocks(body: string): number {
  const lines = body.split("\n");
  let count = 0,
    depth = 0;
  for (const line of lines) {
    const m = line.match(/^(\s{0,3})(`{3,})/);
    if (!m) continue;
    const len = m[2].length;
    if (depth === 0) {
      depth = len;
      count++;
    } else if (len >= depth && /^\s{0,3}`{3,}\s*$/.test(line)) {
      depth = 0;
      count++;
    }
  }
  return count;
}

function stripCodeBlocks(body: string): string {
  // Remove fenced code blocks (3+ backticks or 3+ tildes) properly
  // using the same depth-tracking approach as countFencedBlocks
  const lines = body.split("\n");
  const result: string[] = [];
  let depth = 0; // 0 = outside fence, N = inside fence of this backtick count
  let fenceChar = ""; // "`" or "~"
  for (const line of lines) {
    const backtickFence = line.match(/^(\s{0,3})(`{3,})/);
    const tildeFence = line.match(/^(\s{0,3})(~{3,})/);
    const m = backtickFence || tildeFence;
    if (m && depth === 0) {
      depth = m[2].length;
      fenceChar = m[2][0];
      result.push(""); // blank the fence line
    } else if (
      m &&
      m[2].length >= depth &&
      m[2][0] === fenceChar &&
      /^\s{0,3}[`~]{3,}\s*$/.test(line)
    ) {
      depth = 0;
      fenceChar = "";
      result.push(""); // blank the fence line
    } else if (depth > 0) {
      result.push(""); // blank content inside fences
    } else {
      result.push(line);
    }
  }
  return result.join("\n");
}

function normalizeHeadingSlug(text: string): string {
  return text
    .replace(/\{#[\w-]+\}/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

function getHeadingAnchors(fp: string): Set<string> {
  if (headingAnchorCache.has(fp)) return headingAnchorCache.get(fp)!;
  const anchors = new Set<string>();
  if (fs.existsSync(fp)) {
    const { body } = parseFrontmatter(fs.readFileSync(fp, "utf8"));
    for (const m of stripCodeBlocks(body).matchAll(/^#{1,6}\s+(.+?)(?:\s*\{#([\w-]+)\})?$/gm)) {
      anchors.add((m[2] || normalizeHeadingSlug(m[1])).toLowerCase());
    }
  }
  headingAnchorCache.set(fp, anchors);
  return anchors;
}

function levenshtein(a: string, b: string): number {
  const m: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      m[i][j] =
        a[i - 1] === b[j - 1]
          ? m[i - 1][j - 1]
          : Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + 1);
  return m[a.length][b.length];
}

function fuzzySuggest(broken: string, idx: Set<string>): string | null {
  let best: string | null = null,
    min = 5;
  for (const v of idx) {
    const d = levenshtein(broken, v);
    if (d < min) {
      min = d;
      best = v;
    }
  }
  return best;
}

function getWordCount(text: string): number {
  return stripCodeBlocks(text)
    .replace(/<[^>]+>/g, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function getMonthYear(): string {
  return new Date().toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

// --- Quality Checks ---

function checkReadability(body: string, relPath: string) {
  const clean = stripCodeBlocks(body)
    .replace(/^#{1,6}\s+.*$/gm, "")
    .replace(/[>\-*|]+/g, "");
  const paragraphs = clean.split(/\n{2,}/).filter((p) => p.trim());
  for (const p of paragraphs) {
    if (p.replace(/\s+/g, " ").length > MAX_PARAGRAPH_LENGTH) {
      addWarning(
        "readability",
        relPath,
        "Overly long paragraph detected — consider breaking it up",
      );
    }
  }
}

function checkPlaceholderLeaks(body: string, relPath: string) {
  for (const [label, re] of [
    ["TODO", /\bTODO\b/g],
    ["FIXME", /\bFIXME\b/g],
    ["Lorem Ipsum", /\blorem\s+ipsum\b/gi],
  ] as const) {
    if (re.test(body)) addWarning("readability", relPath, `Stale placeholder: "${label}"`);
  }
}

function validateMermaidDiagrams(body: string, relPath: string) {
  const mermaidRe = /```mermaid\s*\n([\s\S]*?)```/g;
  let m;
  while ((m = mermaidRe.exec(body)) !== null) {
    const code = m[1].trim();
    if (/%%\{init:/.test(code))
      addWarning(
        "mermaid",
        relPath,
        "Mermaid diagram contains %%{init}%% — these are auto-themed, remove custom init",
      );
    if (/classDef\s/.test(code))
      addWarning(
        "mermaid",
        relPath,
        "Mermaid diagram defines classDef — theme auto-colors, remove custom styles",
      );
    if (/style\s+\w+\s+(fill|stroke)/.test(code))
      addWarning(
        "mermaid",
        relPath,
        "Mermaid diagram with hardcoded fill/stroke — use auto-theming",
      );
  }
}

function validateHeadingHierarchy(body: string, relPath: string) {
  const headings = stripCodeBlocks(body).match(/^#{1,6}\s+.+$/gm) || [];
  const stack: number[] = [];
  for (const h of headings) {
    const level = (h.match(/^#+/) || [""])[0].length;
    while (stack.length && stack[stack.length - 1] >= level) stack.pop();
    if (stack.length && level > stack[stack.length - 1] + 1)
      addWarning(
        "structure",
        relPath,
        `Heading level skipped: H${stack[stack.length - 1]} → H${level}`,
      );
    stack.push(level);
  }
}

function detectDuplicateHeadings(body: string, relPath: string) {
  const seen = new Map<string, number>();
  for (const m of stripCodeBlocks(body).matchAll(/^#{1,6}\s+(.+?)(?:\s*\{#.*\})?$/gm)) {
    const t = m[1].trim().toLowerCase();
    seen.set(t, (seen.get(t) || 0) + 1);
  }
  for (const [t, n] of seen) {
    if (n > 1)
      addWarning(
        "structure",
        relPath,
        `Duplicate heading: "${t}" (${n}x) — consider adding {#custom-id}`,
      );
  }
}

function checkMissingH1(body: string, relPath: string) {
  if (!stripCodeBlocks(body).match(/^#\s+/m))
    addWarning("structure", relPath, "Missing top-level H1 heading");
}

function validateTOCLinks(body: string, relPath: string, anchors: Set<string>) {
  for (const m of body.matchAll(/\[([^\]]+)\]\(#([\w-]+)\)/g)) {
    const anchor = m[2].toLowerCase();
    if (anchor !== "top" && !anchors.has(anchor))
      addWarning("structure", relPath, `TOC link to non-existent #${anchor}`);
  }
}

function validateMDXComponents(body: string, relPath: string) {
  const clean = stripCodeBlocks(body);
  // Compound names (kebab-case) are real MDX components: <AdminCard>, <iconify-icon>
  const compoundRe = /<([A-Z][a-zA-Z0-9]*(?:-[A-Za-z][a-zA-Z]*)+)\b([^>]*?)>/g;
  // Simple PascalCase only matches when it has attributes: <Slot name="x">
  // (avoids flagging TypeScript generics like <Buffer>, <T>)
  const simpleAttrRe = /<([A-Z][a-zA-Z0-9]+)\s+[^>/][^>]*>/g;
  const checked = new Set<string>();
  for (const m of clean.matchAll(compoundRe)) {
    const tag = m[1],
      attrs = m[2];
    if (attrs.trimEnd().endsWith("/")) continue;
    if (!body.includes(`</${tag}>`)) addError("mdx", relPath, `Unclosed MDX component: <${tag}>`);
  }
  for (const m of clean.matchAll(simpleAttrRe)) {
    const tag = m[1];
    if (checked.has(tag)) continue;
    checked.add(tag);
    if (!body.includes(`</${tag}>`)) addError("mdx", relPath, `Unclosed MDX component: <${tag}>`);
  }
}

async function checkExternalLink(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(2000),
    });
    if (res.ok) return true;
    const getRes = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(2000),
    });
    return getRes.ok;
  } catch {
    return false;
  }
}

async function validateExternalLinks(body: string, relPath: string) {
  const urls = new Set<string>();
  for (const m of body.matchAll(/\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g)) urls.add(m[2]);
  if (!urls.size) return;
  if (isVerbose) console.log(`   🌐 Probing ${urls.size} external URLs in: ${relPath}`);
  for (const { url, ok } of await Promise.all(
    [...urls].map(async (u) => ({ url: u, ok: await checkExternalLink(u) })),
  )) {
    if (!ok) addWarning("links", relPath, `Broken external URL: ${url}`);
  }
}

// --- Core Engine ---

async function lintSingleFile(fp: string) {
  const raw = fs.readFileSync(fp, "utf8");
  const relPath = path.relative(process.cwd(), fp).replace(/\\/g, "/");
  if (!raw.trim()) {
    addWarning("structure", relPath, "Empty file");
    return;
  }

  let { fm, body } = parseFrontmatter(raw);
  if (!fm) {
    addError("frontmatter", relPath, "Missing MDX frontmatter");
    return;
  }

  let fileModified = false;
  let updatedFm = fm;
  let updatedBody = body;
  const docDir = path.dirname(relPath).replace(/\\/g, "/");
  const actualPath = relPath.replace(/^docs\//, "").replace(/\.(mdx|md)$/, "");
  const today = new Date().toISOString().split("T")[0];

  // --- Frontmatter: path alignment ---
  const pathM = updatedFm.match(/^path:\s*["']?([^"'\n]+)["']?/m);
  if (!pathM) {
    addWarning("frontmatter", relPath, "Missing 'path'");
    if (shouldAutofix && !isDryRun) {
      updatedFm = `path: "${actualPath}"\n` + updatedFm;
      fileModified = true;
    }
  } else {
    // Normalize both sides: strip leading slash and optional docs/ prefix
    // Paths may include docs/ prefix — both forms are valid
    const declared = pathM[1]
      .trim()
      .replace(/^\//, "")
      .replace(/^docs\//, "")
      .replace(/\.(mdx|md)$/, "");
    // Accept both with and without docs/ prefix
    if (declared !== actualPath && declared !== `docs/${actualPath}`) {
      addWarning("frontmatter", relPath, `path mismatch: "${pathM[1].trim()}" vs "${actualPath}"`);
    }
  }

  // --- Frontmatter: title ---
  if (!updatedFm.match(/^title:\s*\S/m)) {
    addError("frontmatter", relPath, "Missing 'title'");
    const h1 = updatedBody.match(/^#\s+(.+)$/m);
    if (h1 && shouldAutofix && !isDryRun) {
      updatedFm = `title: "${h1[1].trim()}"\n` + updatedFm;
      fileModified = true;
    }
  }

  // --- Frontmatter: YAML escaping ---
  const fmLines = updatedFm.split("\n");
  let fmChanged = false;
  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const ci = line.indexOf(":");
    if (ci === -1) continue;
    const key = line.slice(0, ci).trim();
    const val = line.slice(ci + 1).trim();
    if (
      val &&
      !val.startsWith('"') &&
      !val.startsWith("'") &&
      (val.includes(":") || val.includes("{") || val.includes("}"))
    ) {
      addWarning("frontmatter", relPath, `Unquoted special char: "${val}"`);
      if (shouldAutofix && !isDryRun) {
        fmLines[i] = `${key}: "${val.replace(/"/g, '\\"')}"`;
        fmChanged = true;
      }
    }
  }
  if (fmChanged) {
    updatedFm = fmLines.join("\n");
    fileModified = true;
  }

  // --- Frontmatter: updated date ---
  const updatedMatch = updatedFm.match(/^updated:\s*"?(\d{4}-\d{2}-\d{2})"?/m);
  if (updatedMatch) {
    const d = new Date(updatedMatch[1] + "T00:00:00Z");
    if (isNaN(d.getTime())) {
      addError("frontmatter", relPath, `Invalid date: ${updatedMatch[1]}`);
    } else if (updatedMatch[1] > today) {
      addError("frontmatter", relPath, `Future date: ${updatedMatch[1]}`);
      if (shouldAutofix && !isDryRun) {
        updatedFm = updatedFm.replace(/^updated:\s*.*$/m, `updated: "${today}"`);
        fileModified = true;
      }
    } else {
      const yr = new Date();
      yr.setFullYear(yr.getFullYear() - 1);
      if (d < yr) addWarning("frontmatter", relPath, `Stale (>1yr): ${updatedMatch[1]}`);
    }
  } else {
    addWarning("frontmatter", relPath, "Missing 'updated'");
    if (shouldAutofix && !isDryRun) {
      updatedFm += `\nupdated: "${today}"`;
      fileModified = true;
    }
  }

  // --- Image alt & path fixes ---
  for (const m of updatedBody.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
    const alt = m[1].trim(),
      img = m[2].trim().split(/[?#]/)[0];
    if (!alt) {
      addError("a11y", relPath, `Missing alt text: ${img}`);
      if (shouldAutofix && !isDryRun) {
        const placeholder = path
          .basename(img, path.extname(img))
          .replace(/[-_]+/g, " ")
          .replace(/\b\w/g, (c) => c.toUpperCase());
        updatedBody = updatedBody.replace(`![${m[1]}](${m[2]})`, `![${placeholder}](${m[2]})`);
        fileModified = true;
      }
    }
    if (!img.startsWith("http") && !img.startsWith("/")) {
      if (img.includes("\\")) {
        addWarning("links", relPath, `Backslashes in: ${img}`);
        if (shouldAutofix && !isDryRun) {
          updatedBody = updatedBody.replace(img, img.replace(/\\/g, "/"));
          fileModified = true;
        }
      }
      const resolved = path.posix.normalize(path.posix.join(docDir, img.replace(/\\/g, "/")));
      if (!fs.existsSync(path.join(process.cwd(), resolved)) && !hasStaticAsset(img))
        addWarning("links", relPath, `Image not found: ${img}`);
    }
  }

  // --- Internal links ---
  for (const m of updatedBody.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
    const [, , raw] = m;
    if (raw.match(/^https?:\/\//) || raw.startsWith("mailto:")) {
      if (raw.includes("localhost:") || raw.includes("example.com"))
        addWarning("links", relPath, `Dev URL leak: ${raw}`);
      continue;
    }
    const [linkPath, anchor] = raw.split("#");
    let resolved = "",
      targetFile = "";
    if (linkPath) {
      resolved = linkPath.startsWith("/")
        ? linkPath.replace(/^\/docs\//, "").replace(/^\//, "")
        : path.posix.normalize(path.posix.join(docDir, linkPath));
      if (
        !fileIndex.has(resolved) &&
        !fileIndex.has(resolved + ".md") &&
        !fileIndex.has(resolved + ".mdx") &&
        !hasStaticAsset(raw)
      ) {
        const sug = fuzzySuggest(resolved, fileIndex);
        addWarning(
          "links",
          relPath,
          `Broken link: ${raw}`,
          sug ? `Did you mean "${sug}"?` : undefined,
        );
        continue;
      }
      for (const ext of [".md", ".mdx", ""]) {
        const f = path.join(process.cwd(), "docs", resolved + ext);
        if (fs.existsSync(f)) {
          targetFile = f;
          break;
        }
      }
    } else {
      targetFile = fp;
    }
    if (anchor && targetFile) {
      const anchors = getHeadingAnchors(targetFile);
      if (anchors.size && !anchors.has(anchor.toLowerCase()))
        addWarning(
          "links",
          relPath,
          `Broken anchor #${anchor} in ${path.relative(process.cwd(), targetFile)}`,
        );
    }
  }

  // --- EU Compliance ---
  if (COMPETITOR_NAMES.some((n) => updatedBody.includes(n))) {
    competitorDocs++;
    const isCompDoc = /comparison|competitive|benchmark|vs\.?|versus|alternative/i.test(
      relPath + updatedBody.slice(0, 600),
    );
    for (const p of DISCREDITING_PATTERNS)
      if (p.pattern.test(updatedBody)) addError("eu-discredit", relPath, p.message, p.suggestion);
    for (const p of ABSOLUTE_PATTERNS)
      if (p.pattern.test(updatedBody)) addError("eu-absolute", relPath, p.message, p.suggestion);
    if (isCompDoc) {
      if (!REQUIRED_QUALIFIERS.some((r) => r.test(updatedBody))) {
        addError("eu-qualifier", relPath, "Missing EU compliance qualifier");
        if (shouldAutofix && !isDryRun) {
          updatedBody += `\n\n***\n\n*Compliance Disclaimer: Based on publicly available documentation as of ${getMonthYear()}. [EU Directive 2006/114/EC]*\n`;
          fileModified = true;
        }
      }
      const hasPerf = /\b(?:ms|RPS|faster|throughput|latency|benchmark)\b/i.test(updatedBody);
      if (hasPerf && !/methodology|reproduce|measured on|hardware|bun test/i.test(updatedBody))
        addError("eu-methodology", relPath, "Performance claims without methodology");
    }
  }

  // --- Quality checks ---
  checkReadability(updatedBody, relPath);
  checkPlaceholderLeaks(updatedBody, relPath);
  validateMermaidDiagrams(updatedBody, relPath);
  validateHeadingHierarchy(updatedBody, relPath);
  detectDuplicateHeadings(updatedBody, relPath);
  checkMissingH1(updatedBody, relPath);
  validateMDXComponents(updatedBody, relPath);
  validateTOCLinks(updatedBody, relPath, getHeadingAnchors(fp));

  if (countFencedBlocks(updatedBody) % 2 !== 0)
    addWarning("syntax", relPath, "Unbalanced fenced code blocks");
  if (
    updatedBody.includes("<!-- BENCHMARK_START -->") &&
    !updatedBody.includes("<!-- BENCHMARK_END -->")
  )
    addError("tags", relPath, "Missing <!-- BENCHMARK_END -->");

  // --- Complexity ---
  totalWordCount += getWordCount(updatedBody);
  const hCount = (stripCodeBlocks(updatedBody).match(/^#{1,6}\s+/gm) || []).length;
  if (hCount > 60)
    addWarning(
      "structure",
      relPath,
      `High heading density (${hCount} sections) — consider splitting`,
    );
  if (!updatedFm.match(/^description:/m) && (hCount >= 6 || body.length > 2200)) {
    addWarning("frontmatter", relPath, "Missing 'description'");
    if (shouldAutofix && !isDryRun) {
      updatedFm += `\ndescription: "Documentation for ${actualPath.split("/").pop() || "SveltyCMS"}"`;
      fileModified = true;
    }
  }

  // --- External links (optional) ---
  if (checkExternal) await validateExternalLinks(updatedBody, relPath);

  // --- Write ---
  if (shouldAutofix && fileModified && !isDryRun) {
    fs.writeFileSync(fp, `---\n${updatedFm.trim()}\n---\n${updatedBody}`, "utf8");
    console.log(`🛠️  Autofixed: ${relPath}`);
  }
}

// --- Main ---

async function main() {
  if (isDryRun) console.log("🚫 Dry-run — no writes.\n");
  else if (shouldAutofix) console.log("🛠️  Autofix enabled.\n");

  if (targetFilesOnly.length) {
    console.log(`⚡ Targeting ${targetFilesOnly.length} file(s).\n`);
    for (const f of targetFilesOnly) {
      const abs = path.isAbsolute(f) ? f : path.join(process.cwd(), f);
      if (fs.existsSync(abs)) {
        totalFiles++;
        await lintSingleFile(abs);
      }
    }
  } else {
    const files: string[] = [];
    walk(DOCS_DIR, (f) => files.push(f));
    for (const f of files) {
      totalFiles++;
      await lintSingleFile(f);
    }
  }

  const errors = Object.values(errorsByCategory).reduce((a, b) => a + b, 0);
  const warnings = Object.values(warningsByCategory).reduce((a, b) => a + b, 0);
  console.log(
    `\n📊 ${totalFiles} files, ${competitorDocs} competitive. ${errors} errors, ${warnings} warnings.`,
  );
  if (warnings) {
    for (const [c, n] of Object.entries(warningsByCategory).sort(([, a], [, b]) => b - a))
      console.log(`   ⚠️  ${c.padEnd(18)} ${n}`);
  }
  if (errors) {
    for (const [c, n] of Object.entries(errorsByCategory).sort(([, a], [, b]) => b - a))
      console.log(`   ❌ ${c.padEnd(18)} ${n}`);
    console.error(`\n❌ ${errors} errors — blocked.\n`);
    process.exit(1);
  }
  console.log("\n✅ Documentation validated.\n");
}

main().catch((err) => {
  console.error("Linter crashed:", err);
  process.exit(1);
});
