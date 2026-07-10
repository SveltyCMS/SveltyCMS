/**
 * @file scripts\codemods\harden-tests.ts
 * @deprecated Hardens test files by ensuring proper error handling in catch blocks.
 */
import { Glob } from "bun";

const glob = new Glob("tests/{benchmarks,integration}/**/*.test.ts");
const files = Array.from(glob.scanSync());
console.log(`🔍 Found ${files.length} test files for hardening...`);

let hardenedCount = 0;

for (const file of files) {
  const fileRef = Bun.file(file);
  let content = await fileRef.text();
  let changed = false;

  // Robust catch block processing
  const catchRegex = /catch\s*\((err|error): any\)\s*\{([\s\S]*?)\}/g;
  const newContent = content.replace(
    catchRegex,
    (_match: string, varName: string, body: string) => {
      // If it already has a proper re-throw or return outside of a template literal, skip
      // This is a simplified check: we look for throw/return that isn't preceded by `
      const hasTermination = /\b(throw|return)\s+(err|error|new\s+Error|process\.exit)\b/.test(
        body.replace(/`[\s\S]*?`/g, ""),
      );

      if (hasTermination) {
        // Check for the specific broken pattern we might have introduced
        if (body.includes("`") && body.includes("\n    throw ")) {
          // It might be broken, let's fall through to fix it
        } else {
          return _match;
        }
      }

      changed = true;
      let newBody = body.trimEnd();

      // Fix broken template literals from previous runs
      newBody = newBody.replace(
        /(`[\s\S]*?)\$\{err\.message\s*\n\s*throw err;\s*\n\s*\}/g,
        "$1${err.message}",
      );
      newBody = newBody.replace(
        /(`[\s\S]*?)\$\{error\.message\s*\n\s*throw error;\s*\n\s*\}/g,
        "$1${error.message}",
      );

      // Remove duplicate throws at the end of the block
      newBody = newBody.replace(/\s*throw\s+(err|error);$/g, "");
      newBody = newBody.trimEnd();

      // Add the re-throw
      newBody += `\n    throw ${varName};`;

      return `catch (${varName}: any) {${newBody}\n  }`;
    },
  );

  if (changed) {
    await Bun.write(file, newContent);
    hardenedCount++;
    console.log(`✅ Hardened: ${file}`);
  }
}

console.log(`✨ Total files hardened: ${hardenedCount}`);
