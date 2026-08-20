/**
 * @file scripts/check-dead-classes.ts
 * @description
 * Static scanner to ensure no legacy or dead CSS classes (e.g. `variant-*`, misspelled `preset-outline-*`)
 * enter the SveltyCMS codebase.
 *
 * Usage: bun run scripts/check-dead-classes.ts
 * Exit: 0 on success, 1 on failure with file & line locations.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

interface Offense {
  file: string;
  line: number;
  snippet: string;
  reason: string;
}

function walkDir(dir: string, extensions: string[]): string[] {
  let files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === ".svelte-kit" || entry === "paraglide") continue;
      files = files.concat(walkDir(fullPath, extensions));
    } else if (extensions.some((ext) => fullPath.endsWith(ext))) {
      files.push(fullPath);
    }
  }
  return files;
}

const targetFiles = walkDir("src", [".svelte", ".ts", ".js"]);
const offenses: Offense[] = [];

// Patterns to detect
const DEAD_CLASS_PATTERNS = [
  {
    regex: /\bpreset-outline-(?:surface|primary|secondary|tertiary|success|warning|error)\b/g,
    reason: "Misspelled preset: use 'preset-outlined-*' (with 'ed') instead.",
  },
  {
    regex: /\bpreset-outline\b(?!d)/g,
    reason: "Incomplete preset utility: use 'preset-outlined-surface-500' instead.",
  },
  {
    regex:
      /\bvariant-(?:filled|soft|ringed|glass|primary|secondary|tertiary|surface|success|warning|error)\b/g,
    reason: "Legacy Skeleton variant class has no matching CSS rules in Tailwind v4.",
  },
];

for (const file of targetFiles) {
  // Skip this scanner script and app.css definitions
  if (file.includes("check-dead-classes") || file.endsWith(".css")) continue;

  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");

  lines.forEach((lineText, idx) => {
    // Ignore comments that explicitly discuss legacy classes
    if (
      lineText.trim().startsWith("//") ||
      lineText.trim().startsWith("/*") ||
      lineText.trim().startsWith("*")
    ) {
      return;
    }

    for (const pattern of DEAD_CLASS_PATTERNS) {
      if (pattern.regex.test(lineText)) {
        offenses.push({
          file,
          line: idx + 1,
          snippet: lineText.trim(),
          reason: pattern.reason,
        });
      }
    }
  });
}

if (offenses.length > 0) {
  console.error(`\n❌ Found ${offenses.length} dead or invalid CSS class occurrence(s):\n`);
  for (const o of offenses) {
    console.error(`  ${o.file}:${o.line}`);
    console.error(`    Snippet: ${o.snippet}`);
    console.error(`    Reason:  ${o.reason}\n`);
  }
  process.exit(1);
} else {
  console.log("✅ Dead class scanner: No legacy variant-* or broken preset-* classes found.");
  process.exit(0);
}
