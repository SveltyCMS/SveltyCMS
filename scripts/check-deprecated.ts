/**
 * @file scripts/check-deprecated.ts
 * @description Scans the codebase for TypeScript TS6385 deprecated symbol usages.
 *
 * Uses the TypeScript Compiler API to extract semantic diagnostics and filter
 * specifically for deprecated declarations and calls across src, config, and tests.
 */

import ts from "typescript";
import path from "node:path";

function scanDeprecated() {
  const configPath = ts.findConfigFile("./", ts.sys.fileExists, "tsconfig.json");
  if (!configPath) {
    console.error("Could not find tsconfig.json");
    process.exit(1);
  }

  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) {
    console.error("Error reading tsconfig.json:", readResult.error.messageText);
    process.exit(1);
  }

  const parsedConfig = ts.parseJsonConfigFileContent(
    readResult.config,
    ts.sys,
    path.dirname(configPath),
  );

  console.log("🔍 Creating TypeScript program to scan for deprecated code...");
  const program = ts.createProgram({
    rootNames: parsedConfig.fileNames,
    options: {
      ...parsedConfig.options,
      noEmit: true,
      skipLibCheck: true,
    },
  });

  const sourceFiles = program
    .getSourceFiles()
    .filter(
      (sf) =>
        !sf.isDeclarationFile &&
        !sf.fileName.includes("node_modules") &&
        !sf.fileName.includes(".svelte-kit") &&
        !sf.fileName.includes("src/paraglide"),
    );

  console.log(`📂 Analyzing ${sourceFiles.length} source files for deprecated symbols (TS6385)...`);

  let deprecatedCount = 0;
  const findings: Array<{ file: string; line: number; col: number; message: string }> = [];

  for (const sf of sourceFiles) {
    const diagnostics = program.getSemanticDiagnostics(sf);
    for (const diag of diagnostics) {
      // TS6385 is "'{0}' is deprecated."
      if (diag.code === 6385) {
        deprecatedCount++;
        const { line, character } = sf.getLineAndCharacterOfPosition(diag.start ?? 0);
        const message = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
        const relPath = path.relative(process.cwd(), sf.fileName);
        findings.push({
          file: relPath,
          line: line + 1,
          col: character + 1,
          message,
        });
      }
    }
  }

  if (findings.length === 0) {
    console.log("✅ No deprecated symbol usages found!");
  } else {
    console.log(`\n⚠️  Found ${findings.length} deprecated symbol usage(s):\n`);
    for (const f of findings) {
      console.log(`  • ${f.file}:${f.line}:${f.col} — ${f.message}`);
    }
  }

  return findings.length;
}

const count = scanDeprecated();
process.exit(count > 0 ? 1 : 0);
