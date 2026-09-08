/**
 * @file src/utils/translation-analytics.ts
 * @description Utilities to calculate per-field and document-level multilingual translation progress.
 *
 * Features:
 * - Computes translation completion percentage per target locale
 * - Identifies missing untranslated fields for translation cockpit
 * - Status variant resolution following SveltyCMS design token status-shade contract
 */

export interface TranslatableFieldSchema {
  name: string;
  label?: string;
  translated?: boolean;
  type?: string;
}

export interface LanguageProgress {
  locale: string;
  translated: number;
  total: number;
  percentage: number;
  missingFields: string[];
}

export interface DocumentTranslationSummary {
  overallPercentage: number;
  languages: Record<string, LanguageProgress>;
  isFullyTranslated: boolean;
}

/**
 * Checks if a value is non-empty for a specific locale in a translated field.
 */
export function isFieldTranslatedForLocale(value: unknown, targetLocale: string): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;

  if (typeof value === "object" && !Array.isArray(value)) {
    const localizedValue = (value as Record<string, unknown>)[targetLocale];
    if (localizedValue === null || localizedValue === undefined) return false;
    if (typeof localizedValue === "string") return localizedValue.trim().length > 0;
    if (typeof localizedValue === "number" || typeof localizedValue === "boolean") return true;
    if (Array.isArray(localizedValue)) return localizedValue.length > 0;
  }

  return false;
}

/**
 * Computes translation progress for a single target locale across document fields.
 */
export function calculateLocaleProgress(
  doc: Record<string, unknown> | null | undefined,
  fields: TranslatableFieldSchema[],
  targetLocale: string,
): LanguageProgress {
  const translatable = fields.filter((f) => f.translated === true);
  if (translatable.length === 0) {
    return {
      locale: targetLocale,
      translated: 0,
      total: 0,
      percentage: 100,
      missingFields: [],
    };
  }

  const missingFields: string[] = [];
  let translatedCount = 0;

  for (const field of translatable) {
    const val = doc ? doc[field.name] : undefined;
    if (isFieldTranslatedForLocale(val, targetLocale)) {
      translatedCount++;
    } else {
      missingFields.push(field.label || field.name);
    }
  }

  const percentage = Math.round((translatedCount / translatable.length) * 100);

  return {
    locale: targetLocale,
    translated: translatedCount,
    total: translatable.length,
    percentage,
    missingFields,
  };
}

/**
 * Computes a comprehensive translation summary across all active system languages.
 */
export function calculateDocumentTranslationSummary(
  doc: Record<string, unknown> | null | undefined,
  fields: TranslatableFieldSchema[],
  activeLocales: string[],
): DocumentTranslationSummary {
  const languages: Record<string, LanguageProgress> = {};
  let totalPercentage = 0;

  for (const loc of activeLocales) {
    const progress = calculateLocaleProgress(doc, fields, loc);
    languages[loc] = progress;
    totalPercentage += progress.percentage;
  }

  const count = activeLocales.length || 1;
  const overallPercentage = Math.round(totalPercentage / count);
  const isFullyTranslated = Object.values(languages).every((l) => l.percentage === 100);

  return {
    overallPercentage,
    languages,
    isFullyTranslated,
  };
}

/**
 * Returns badge variant and label conforming to the status-shade contract.
 */
export function getTranslationStatusToken(percentage: number): {
  label: string;
  variant: "success" | "warning" | "tertiary" | "error" | "surface";
  badgeClass: string;
} {
  if (percentage >= 100) {
    return {
      label: "100%",
      variant: "success",
      badgeClass: "bg-success-500/10 text-success-500 border border-success-500/30",
    };
  }
  if (percentage >= 60) {
    return {
      label: `${percentage}%`,
      variant: "warning",
      badgeClass: "bg-warning-500/10 text-warning-500 border border-warning-500/30",
    };
  }
  if (percentage > 0) {
    return {
      label: `${percentage}%`,
      variant: "tertiary",
      badgeClass: "bg-tertiary-500/10 text-tertiary-500 border border-tertiary-500/30",
    };
  }
  return {
    label: "0%",
    variant: "error",
    badgeClass: "bg-error-500/10 text-error-500 border border-error-500/30",
  };
}

export interface TranslationProgressSummary {
  overallProgress: number;
  overallPercentage: number;
  translatableFieldsCount: number;
  byLocale: Record<string, number>;
  missingFieldsByLocale: Record<string, string[]>;
  languages: Record<string, LanguageProgress>;
  isFullyTranslated: boolean;
}

export function computeDocumentTranslationSummary(
  fields: Array<{
    name: string;
    label?: string;
    widget?: { translated?: boolean };
    translated?: boolean;
  }>,
  doc: Record<string, unknown> | null | undefined,
  activeLocales: string[],
  _defaultLocale?: string,
): TranslationProgressSummary {
  const normalizedFields: TranslatableFieldSchema[] = fields.map((f) => ({
    name: f.name,
    label: f.label,
    translated: f.translated ?? f.widget?.translated ?? false,
  }));

  const baseSummary = calculateDocumentTranslationSummary(doc, normalizedFields, activeLocales);
  const translatableCount = normalizedFields.filter((f) => f.translated).length;

  const byLocale: Record<string, number> = {};
  const missingFieldsByLocale: Record<string, string[]> = {};

  for (const [loc, prog] of Object.entries(baseSummary.languages)) {
    byLocale[loc] = prog.percentage;
    missingFieldsByLocale[loc] = prog.missingFields;
  }

  return {
    overallProgress: baseSummary.overallPercentage,
    overallPercentage: baseSummary.overallPercentage,
    translatableFieldsCount: translatableCount,
    byLocale,
    missingFieldsByLocale,
    languages: baseSummary.languages,
    isFullyTranslated: baseSummary.isFullyTranslated,
  };
}

export function getStatusToken(percentage: number): {
  badgeVariant: "success" | "warning" | "tertiary" | "error" | "surface";
  textClass: string;
  bgClass: string;
  borderClass: string;
  badgeClass: string;
} {
  const token = getTranslationStatusToken(percentage);
  return {
    badgeVariant: token.variant,
    textClass: `text-${token.variant}-500`,
    bgClass: `bg-${token.variant}-500/10`,
    borderClass: `border-${token.variant}-500/30`,
    badgeClass: token.badgeClass,
  };
}
