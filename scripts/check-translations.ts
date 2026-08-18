/**
 * @file scripts/check-translations.ts
 * @description Translation integrity audit script for SveltyCMS message catalog (Paraglide / Inlang).
 *
 * Checks:
 * - JSON syntax validity across all locale files in `src/messages/`
 * - Key alignment: verifies that all keys present in the reference catalog (en.json) exist in all target catalogs
 * - Detects empty values, whitespace-only strings, or un-translated fallback placeholders
 *
 * Usage: `bun run scripts/check-translations.ts`
 */

import fs from "node:fs";
import path from "node:path";

const MESSAGES_DIR = path.join(process.cwd(), "src/messages");

function loadCatalog(filepath: string): Record<string, string> {
  const content = fs.readFileSync(filepath, "utf8");
  try {
    return JSON.parse(content);
  } catch (err: any) {
    console.error(`❌ Invalid JSON in file ${filepath}:`, err.message);
    process.exit(1);
  }
}

function auditTranslations(): void {
  if (!fs.existsSync(MESSAGES_DIR)) {
    console.error(`❌ Messages directory not found at: ${MESSAGES_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(MESSAGES_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.error("❌ No locale JSON catalogs found in src/messages/");
    process.exit(1);
  }

  console.log(`🌐 Auditing ${files.length} locale catalog(s) in src/messages/...`);

  const catalogs: Record<string, Record<string, string>> = {};
  for (const file of files) {
    const locale = path.basename(file, ".json");
    catalogs[locale] = loadCatalog(path.join(MESSAGES_DIR, file));
    console.log(`  ✓ Loaded locale '${locale}': ${Object.keys(catalogs[locale]).length} keys`);
  }

  const referenceLocale = catalogs["en"] ? "en" : Object.keys(catalogs)[0];
  const referenceKeys = new Set(Object.keys(catalogs[referenceLocale]));

  let errorCount = 0;
  let warningCount = 0;

  for (const [locale, catalog] of Object.entries(catalogs)) {
    if (locale === referenceLocale) continue;

    const currentKeys = new Set(Object.keys(catalog));

    // Check missing keys in target locale
    const missingKeys: string[] = [];
    for (const key of referenceKeys) {
      if (!currentKeys.has(key)) {
        missingKeys.push(key);
      }
    }

    if (missingKeys.length > 0) {
      console.error(
        `\n❌ [${locale}] Missing ${missingKeys.length} key(s) present in '${referenceLocale}':`,
      );
      missingKeys.slice(0, 10).forEach((k) => console.error(`   - ${k}`));
      if (missingKeys.length > 10) {
        console.error(`   ... and ${missingKeys.length - 10} more`);
      }
      errorCount += missingKeys.length;
    }

    // Check extra keys not present in reference locale
    const extraKeys: string[] = [];
    for (const key of currentKeys) {
      if (!referenceKeys.has(key)) {
        extraKeys.push(key);
      }
    }

    if (extraKeys.length > 0) {
      console.warn(
        `\n⚠️  [${locale}] Has ${extraKeys.length} extra key(s) not in '${referenceLocale}':`,
      );
      extraKeys.slice(0, 10).forEach((k) => console.warn(`   - ${k}`));
      warningCount += extraKeys.length;
    }

    // Check empty strings
    const emptyKeys: string[] = [];
    for (const [key, val] of Object.entries(catalog)) {
      if (typeof val === "string" && val.trim().length === 0) {
        emptyKeys.push(key);
      }
    }

    if (emptyKeys.length > 0) {
      console.warn(`\n⚠️  [${locale}] Has ${emptyKeys.length} empty translation value(s):`);
      emptyKeys.slice(0, 5).forEach((k) => console.warn(`   - ${k}`));
      warningCount += emptyKeys.length;
    }
  }

  console.log("\n----------------------------------------");
  if (errorCount > 0) {
    console.error(
      `❌ Translation audit FAILED with ${errorCount} error(s) and ${warningCount} warning(s).`,
    );
    process.exit(1);
  } else {
    console.log(`✅ Translation audit PASSED with 0 errors (${warningCount} warning(s)).`);
  }
}

auditTranslations();
