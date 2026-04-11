/**
 * @file src/utils/pluralize.ts
 * @description Internationalized utility for handling zero/singular/plural word forms
 */

/**
 * Forms definition for a single word in multiple localized plural categories.
 * Keys map to the categories returned by Intl.PluralRules.select().
 */
export interface PluralForms {
  zero?: string;
  one?: string;
  two?: string;
  few?: string;
  many?: string;
  other: string; // "other" is generally the fallback/standard plural form
}

/**
 * Returns the plural form of a given word based on the count, locale, and provided plural forms.
 * Powered by Intl.PluralRules to support all languages universally.
 *
 * @param count - The number of items
 * @param forms - An object mapping LDML plural categories to localized strings
 * @param locale - The locale string (e.g. 'en-US', 'ar-SA', 'ru-RU')
 * @param appendCount - Whether to append the count before the word (default: false)
 * @returns The correctly pluralized word
 */
export function pluralize(
  count: number,
  forms: PluralForms,
  locale: string = "en",
  appendCount = false,
): string {
  const pr = new Intl.PluralRules(locale);
  const rule = pr.select(count);

  // Special check for purely '0' if 'zero' is provided explicitly in the forms
  // (Since Intl.PluralRules in some languages maps 0 to 'other' instead of 'zero')
  let result = forms.other;

  if (count === 0 && forms.zero !== undefined) {
    result = forms.zero;
  } else if (forms[rule] !== undefined) {
    result = forms[rule] as string;
  }

  if (appendCount) {
    return `${count} ${result}`;
  }

  return result;
}
