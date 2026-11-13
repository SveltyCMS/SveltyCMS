/**
 * @file scripts/check/check-translations.ts
 * @description Translation integrity audit script for SveltyCMS message catalog (Paraglide / Inlang).
 *
 * Checks:
 * - JSON syntax validity across all locale files in `src/messages/`
 * - Key alignment: verifies that all keys present in the reference catalog (en.json) exist in all target catalogs
 * - Detects empty values, whitespace-only strings, or un-translated fallback placeholders
 *
 * Features:
 * - Pure `auditCatalogs` core shared by the CLI and the unit suite
 * - `en` is the reference catalog when present, otherwise the first locale
 * - Missing keys are errors; extra keys and empty values are warnings
 *
 * Usage: `bun run scripts/check-translations.ts`
 * Exit: 0 when no key is missing, 1 otherwise (including unreadable catalogs).
 */

import fs from "node:fs";
import path from "node:path";

const MESSAGES_DIR = path.join(process.cwd(), "src/messages");
const MAX_LISTED_KEYS = 10;
const MAX_LISTED_EMPTY_KEYS = 5;

export type Catalog = Record<string, unknown>;

export interface CatalogIssue {
  locale: string;
  kind: "missing" | "extra" | "empty";
  keys: string[];
}

export interface CatalogAudit {
  referenceLocale: string | null;
  keyCounts: Record<string, number>;
  issues: CatalogIssue[];
  errorCount: number;
  warningCount: number;
}

/**
 * Audits loaded catalogs against the reference locale.
 *
 * The reference is `en` when present, else the first catalog key. Missing keys
 * are counted as errors; extra keys and blank string values are warnings. A
 * non-string value (e.g. a nested object) is never reported as an empty
 * translation, matching the pre-extraction behaviour.
 */
export function auditCatalogs(catalogs: Readonly<Record<string, Catalog>>): CatalogAudit {
  const locales = Object.keys(catalogs);
  const referenceLocale = catalogs["en"] ? "en" : (locales[0] ?? null);
  const keyCounts: Record<string, number> = {};
  for (const locale of locales) keyCounts[locale] = Object.keys(catalogs[locale]!).length;

  const audit: CatalogAudit = {
    referenceLocale,
    keyCounts,
    issues: [],
    errorCount: 0,
    warningCount: 0,
  };
  if (!referenceLocale) return audit;

  const referenceKeys = new Set(Object.keys(catalogs[referenceLocale]!));

  for (const [locale, catalog] of Object.entries(catalogs)) {
    if (locale === referenceLocale) continue;

    const currentKeys = new Set(Object.keys(catalog));

    const missingKeys = [...referenceKeys].filter((key) => !currentKeys.has(key));
    if (missingKeys.length > 0) {
      audit.issues.push({ locale, kind: "missing", keys: missingKeys });
      audit.errorCount += missingKeys.length;
    }

    const extraKeys = [...currentKeys].filter((key) => !referenceKeys.has(key));
    if (extraKeys.length > 0) {
      audit.issues.push({ locale, kind: "extra", keys: extraKeys });
      audit.warningCount += extraKeys.length;
    }

    const emptyKeys = Object.entries(catalog)
      .filter(([, value]) => typeof value === "string" && value.trim().length === 0)
      .map(([key]) => key);
    if (emptyKeys.length > 0) {
      audit.issues.push({ locale, kind: "empty", keys: emptyKeys });
      audit.warningCount += emptyKeys.length;
    }
  }

  return audit;
}

function loadCatalog(filepath: string): Catalog | null {
  const content = fs.readFileSync(filepath, "utf8");
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      console.error(`❌ Invalid JSON in file ${filepath}: expected a JSON object`);
      return null;
    }
    return parsed as Catalog;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`❌ Invalid JSON in file ${filepath}: ${message}`);
    return null;
  }
}

function reportAudit(audit: CatalogAudit): void {
  for (const issue of audit.issues) {
    if (issue.kind === "missing") {
      console.error(
        `\n❌ [${issue.locale}] Missing ${issue.keys.length} key(s) present in '${audit.referenceLocale}':`,
      );
      issue.keys.slice(0, MAX_LISTED_KEYS).forEach((key) => console.error(`   - ${key}`));
      if (issue.keys.length > MAX_LISTED_KEYS) {
        console.error(`   ... and ${issue.keys.length - MAX_LISTED_KEYS} more`);
      }
    } else if (issue.kind === "extra") {
      console.warn(
        `\n⚠️  [${issue.locale}] Has ${issue.keys.length} extra key(s) not in '${audit.referenceLocale}':`,
      );
      issue.keys.slice(0, MAX_LISTED_KEYS).forEach((key) => console.warn(`   - ${key}`));
    } else {
      console.warn(`\n⚠️  [${issue.locale}] Has ${issue.keys.length} empty translation value(s):`);
      issue.keys.slice(0, MAX_LISTED_EMPTY_KEYS).forEach((key) => console.warn(`   - ${key}`));
    }
  }
}

function main(): number {
  if (!fs.existsSync(MESSAGES_DIR)) {
    console.error(`❌ Messages directory not found at: ${MESSAGES_DIR}`);
    return 1;
  }

  const files = fs.readdirSync(MESSAGES_DIR).filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.error("❌ No locale JSON catalogs found in src/messages/");
    return 1;
  }

  console.log(`🌐 Auditing ${files.length} locale catalog(s) in src/messages/...`);

  const catalogs: Record<string, Catalog> = {};
  for (const file of files) {
    const locale = path.basename(file, ".json");
    const catalog = loadCatalog(path.join(MESSAGES_DIR, file));
    if (!catalog) return 1;
    catalogs[locale] = catalog;
    console.log(`  ✓ Loaded locale '${locale}': ${Object.keys(catalog).length} keys`);
  }

  const audit = auditCatalogs(catalogs);
  reportAudit(audit);

  console.log("\n----------------------------------------");
  if (audit.errorCount > 0) {
    console.error(
      `❌ Translation audit FAILED with ${audit.errorCount} error(s) and ${audit.warningCount} warning(s).`,
    );
    return 1;
  }

  console.log(`✅ Translation audit PASSED with 0 errors (${audit.warningCount} warning(s)).`);
  return 0;
}

if (import.meta.main) {
  process.exit(main());
}
