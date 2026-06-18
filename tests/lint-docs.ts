/**
 * @file tests/lint-docs.ts
 * @description Semantic + Compliance Linter for SveltyCMS Documentation
 *
 * Enforces:
 * - Frontmatter structure & metadata quality
 * - Internal link integrity (with relative path resolution)
 * - Image accessibility (alt text)
 * - Markdown structural health (fenced blocks)
 * - SveltyCMS-specific annotation tags
 * - 🇪🇺 EU Directive 2006/114/EC + German UWG §6 compliance
 *
 * Run: `bun run lint:docs`
 * CI-friendly: exits 1 on errors, 0 on warnings-only
 */

import fs from "node:fs";
import path from "node:path";

const DOCS_DIR = path.join(process.cwd(), "docs");
const STATIC_DIR = path.join(process.cwd(), "static", "docs");

// 🇪🇺 EU Compliance: competitor names that trigger review
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

// 🇪🇺 EU Compliance: discrediting language (German UWG §6)
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

// 🇪🇺 EU Compliance: unverifiable absolute claims
const ABSOLUTE_PATTERNS: Array<{
  pattern: RegExp;
  message: string;
  suggestion?: string;
}> = [
  {
    pattern: /\bonly\s+CMS\b/gi,
    message: 'Unverifiable: "only CMS"',
    suggestion: 'Use "one of the few" or add date-stamped qualifier',
  },
  {
    pattern: /\bindustry-?first\b/gi,
    message: 'Unverifiable: "industry-first"',
    suggestion: 'Use "not publicly documented by other platforms as of [date]"',
  },
  {
    pattern: /\b(?:fastest|best|leading|top|ultimate)\s+CMS\b/gi,
    message: "Unverifiable superlative",
    suggestion: "Cite specific benchmark data with methodology",
  },
  {
    pattern: /\bno\s+competitor\s+offers?\b/gi,
    message: 'Unverifiable: "no competitor offers"',
    suggestion: 'Use "no competitor is known to offer (based on public docs)"',
  },
  {
    pattern: /\bsuperior\s+(?:to|than)\b/gi,
    message: "Unverifiable superiority claim",
    suggestion: "Compare specific measurable features instead",
  },
];

// 🇪🇺 EU Compliance: required qualifiers for competitive docs
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

// --- Statistics ---
let totalFiles = 0;
let competitorDocs = 0;
const errorsByCategory: Record<string, number> = {};
const warningsByCategory: Record<string, number> = {};

// --- Helpers ---

function walk(dir: string, callback: (filePath: string) => void): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".")) {
      walk(fullPath, callback);
    } else if (entry.name.endsWith(".md") || entry.name.endsWith(".mdx")) {
      callback(fullPath);
    }
  }
}

function addError(category: string, relPath: string, msg: string, suggestion?: string): void {
  console.error(`❌ [${relPath}] ${category}: ${msg}`);
  if (suggestion) console.error(`   💡 ${suggestion}`);
  errorsByCategory[category] = (errorsByCategory[category] || 0) + 1;
}

function addWarning(category: string, relPath: string, msg: string, suggestion?: string): void {
  console.warn(`⚠️  [${relPath}] ${category}: ${msg}`);
  if (suggestion) console.warn(`   💡 ${suggestion}`);
  warningsByCategory[category] = (warningsByCategory[category] || 0) + 1;
}

function parseFrontmatter(content: string): { fm: string; body: string } {
  if (!content.startsWith("---")) return { fm: "", body: content };
  const end = content.indexOf("---", 3);
  if (end === -1) return { fm: "", body: content };
  return { fm: content.slice(3, end).trim(), body: content.slice(end + 3) };
}

function buildFileIndex(docsDir: string): Set<string> {
  const index = new Set<string>();
  walk(docsDir, (fp) => {
    const rel = path.relative(docsDir, fp).replace(/\\/g, "/");
    index.add(rel);
    index.add(rel.replace(/\.(mdx|md)$/, ""));
    index.add(`/docs/${rel}`);
    index.add(`/docs/${rel.replace(/\.(mdx|md)$/, "")}`);
  });
  return index;
}

function hasStaticAsset(link: string): boolean {
  const clean = link.replace(/^\/?(docs|static)\//, "");
  try {
    fs.accessSync(path.join(STATIC_DIR, clean));
    return true;
  } catch {
    return false;
  }
}

// --- Main ---

console.log("🔍 Linting SveltyCMS documentation + 🇪🇺 EU Compliance...\n");

const fileIndex = buildFileIndex(DOCS_DIR);
const now = new Date();

walk(DOCS_DIR, (filePath) => {
  totalFiles++;
  const content = fs.readFileSync(filePath, "utf8");
  const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, "/");

  const { fm, body } = parseFrontmatter(content);

  // ===== 1. Frontmatter =====
  if (!fm) {
    addError("frontmatter", relPath, "Missing MDX frontmatter");
    return;
  }

  if (!fm.match(/^title:\s*\S/m)) addError("frontmatter", relPath, "Missing 'title'");
  if (!fm.match(/^path:\s*\S/m)) addError("frontmatter", relPath, "Missing 'path'");

  const updatedMatch = fm.match(/^updated:\s*"?(\d{4}-\d{2}-\d{2})"?/m);
  if (updatedMatch) {
    const date = new Date(updatedMatch[1] + "T00:00:00Z");
    if (isNaN(date.getTime())) {
      addError("frontmatter", relPath, `Invalid 'updated' date: ${updatedMatch[1]}`);
    } else if (date > now) {
      addError("frontmatter", relPath, `'updated' is in the future: ${updatedMatch[1]}`);
    }
  }

  const orderMatch = fm.match(/^order:\s*(\S+)/m);
  if (orderMatch && isNaN(Number(orderMatch[1]))) {
    addError("frontmatter", relPath, `'order' must be a number, got: ${orderMatch[1]}`);
  }

  // ===== 2. Internal Link Integrity =====
  const docDir = path.dirname(relPath.replace(/^docs\//, "")).replace(/\\/g, "/");

  for (const match of body.matchAll(/\[([^\]]*)\]\(([^)]+)\)/g)) {
    const [, text, rawLink] = match;
    if (rawLink.match(/^https?:\/\//) || rawLink.startsWith("#") || rawLink.startsWith("mailto:"))
      continue;

    const clean = rawLink.split(/[?#]/)[0];
    if (!clean) continue;

    const resolved = clean.startsWith("/")
      ? clean.replace(/^\/docs\//, "").replace(/^\//, "")
      : path.posix.normalize(path.posix.join(docDir, clean));

    const found =
      fileIndex.has(resolved) ||
      fileIndex.has(resolved + ".md") ||
      fileIndex.has(resolved + ".mdx") ||
      hasStaticAsset(rawLink);

    if (!found) {
      addWarning("links", relPath, `Broken link: ${rawLink} (text: "${text.slice(0, 40)}")`);
    }
  }

  // ===== 3. Image Accessibility =====
  for (const match of body.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)) {
    const alt = match[1].trim();
    if (!alt) {
      addError(
        "a11y",
        relPath,
        `Missing alt text: ${match[2].slice(0, 50)}`,
        "Add descriptive alt text",
      );
    }
  }

  // ===== 4. Fenced Block Balance =====
  // Count all valid fenced code block markers (0-3 spaces of indentation per CommonMark)
  const blockCount = (body.match(/^\s{0,3}```/gm) || []).length;
  if (blockCount % 2 !== 0) {
    addWarning("syntax", relPath, "Unbalanced fenced code blocks");
  }

  // ===== 5. SveltyCMS Tags =====
  if (body.includes("<!-- BENCHMARK_START -->") && !body.includes("<!-- BENCHMARK_END -->")) {
    addError("tags", relPath, "Missing <!-- BENCHMARK_END -->");
  }

  // ===== 6. 🇪🇺 EU/German Comparative Advertising Compliance =====
  // Only check body text (exclude frontmatter to avoid false positives)
  const mentionsCompetitor = COMPETITOR_NAMES.some((name) => body.includes(name));

  if (mentionsCompetitor) {
    competitorDocs++;
    const isCompetitiveDoc =
      /comparison|competitive|benchmark|evaluation|roadmap|vs\.?|versus|alternative/i.test(
        relPath + " " + body.slice(0, 800),
      );

    for (const { pattern, message, suggestion } of DISCREDITING_PATTERNS) {
      if (pattern.test(body)) addError("eu-discredit", relPath, message, suggestion);
    }
    for (const { pattern, message, suggestion } of ABSOLUTE_PATTERNS) {
      if (pattern.test(body)) addError("eu-absolute", relPath, message, suggestion);
    }

    if (isCompetitiveDoc) {
      if (!REQUIRED_QUALIFIERS.some((r) => r.test(body))) {
        addError(
          "eu-qualifier",
          relPath,
          "Competitive doc lacks EU compliance qualifier",
          'Add "based on publicly available documentation as of [date]"',
        );
      }

      const hasPerf =
        /\b(?:ms|RPS|faster|slower|throughput|latency|benchmark|outperforms?)\b/i.test(body);
      const hasMethod = /methodology|reproduce|bun test|measured on|hardware|tested on/i.test(body);
      if (hasPerf && !hasMethod) {
        addError(
          "eu-methodology",
          relPath,
          "Performance claims without methodology",
          "Add measurement date, hardware specs, and reproduction commands",
        );
      }
    }
  }
});

// --- Report ---
const errorCount = Object.values(errorsByCategory).reduce((a, b) => a + b, 0);
const warningCount = Object.values(warningsByCategory).reduce((a, b) => a + b, 0);

console.log(
  `\n📊 ${totalFiles} files, ${competitorDocs} with competitors. ${errorCount} errors, ${warningCount} warnings.\n`,
);

if (warningCount > 0) {
  console.log("  Warnings (non-blocking):");
  for (const [cat, count] of Object.entries(warningsByCategory).sort(([, a], [, b]) => b - a)) {
    console.log(`    ${cat.padEnd(18)} ${count}`);
  }
}

if (errorCount > 0) {
  console.log("\n  ❌ Errors (blocking):");
  for (const [cat, count] of Object.entries(errorsByCategory).sort(([, a], [, b]) => b - a)) {
    console.log(`    ${cat.padEnd(18)} ${count}`);
  }
  console.error(`\n❌ ${errorCount} errors — commit blocked.\n`);
  process.exit(1);
}

console.log("\n✅ Documentation structure + 🇪🇺 EU Compliance verified.\n");
process.exit(0);
