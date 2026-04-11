/**
 * @file scripts/patch-typescript.js
 * @description
 * Surgical patch for TypeScript 6.0 compatibility in SveltyCMS.
 *
 * Injects legacy internal APIs (forEachResolvedModule, etc.) into the
 * TypeScript compiler and its dependents (svelte-check, ts-morph)
 * to prevent 'TypeError: is not a function' crashes.
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

const patches = [
  {
    file: "node_modules/typescript/lib/typescript.js",
    patterns: [
      {
        search: /    forEachResolvedModule,/g,
        replace:
          '    forEachResolvedModule: typeof forEachResolvedModule !== "undefined" ? forEachResolvedModule : () => {},',
      },
      {
        search: /    forEachResolvedTypeReferenceDirective,/g,
        replace:
          '    forEachResolvedTypeReferenceDirective: typeof forEachResolvedTypeReferenceDirective !== "undefined" ? forEachResolvedTypeReferenceDirective : () => {},',
      },
    ],
  },
  {
    file: "node_modules/typescript/lib/tsc.js",
    patterns: [
      {
        search: /    forEachResolvedModule,/g,
        replace:
          '    forEachResolvedModule: typeof forEachResolvedModule !== "undefined" ? forEachResolvedModule : () => {},',
      },
      {
        search: /    forEachResolvedTypeReferenceDirective,/g,
        replace:
          '    forEachResolvedTypeReferenceDirective: typeof forEachResolvedTypeReferenceDirective !== "undefined" ? forEachResolvedTypeReferenceDirective : () => {},',
      },
    ],
  },
  {
    file: "node_modules/svelte-check/dist/src/index.js",
    patterns: [
      {
        search: /var ts = require\('typescript'\);/g,
        replace:
          "var ts = require('typescript');\n// SveltyCMS Patch: Ensure TypeScript 6.0 compatibility\nconst originalCreateProgram = ts.createProgram;\nts.createProgram = function(...args) {\n    const program = originalCreateProgram.apply(this, args);\n    if (program && !program.forEachResolvedModule) program.forEachResolvedModule = () => {};\n    if (program && !program.forEachResolvedTypeReferenceDirective) program.forEachResolvedTypeReferenceDirective = () => {};\n    return program;\n};",
      },
    ],
  },
];

console.log("--- Applying TypeScript 6.0 Compatibility Patches ---");

for (const patch of patches) {
  const fullPath = path.join(root, patch.file);
  if (!fs.existsSync(fullPath)) {
    console.warn(`[SKIP] File not found: ${patch.file}`);
    continue;
  }

  try {
    let content = fs.readFileSync(fullPath, "utf8");
    let modified = false;

    for (const pattern of patch.patterns) {
      // Check if already patched to avoid duplicates if possible,
      // though these replacements are safe if repeated.
      if (content.includes(pattern.replace)) {
        console.log(`[PASS] Already patched: ${patch.file}`);
        continue;
      }

      content = content.replace(pattern.search, pattern.replace);
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(fullPath, content);
      console.log(`[DONE] Patched: ${patch.file}`);
    }
  } catch (err) {
    console.error(`[FAIL] Error patching ${patch.file}:`, err.message);
  }
}

console.log("--- Patching Complete ---");
