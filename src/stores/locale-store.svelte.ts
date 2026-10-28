/**
 * @file src/stores/locale-store.svelte.ts
 * @description Reactive locale state — system language, content language, and translation progress.
 *
 * Features:
 * - systemLanguage / contentLanguage via AppStore singleton
 * - translationProgress with per-field localization tracking
 */

import { SvelteSet } from "svelte/reactivity";

class LocaleStore {
  systemLanguage = $state("en");
  contentLanguage = $state("en");
}

export const locale = new LocaleStore();

export const systemLanguage = {
  get value() {
    return locale.systemLanguage;
  },
  set value(v: string) {
    locale.systemLanguage = v;
  },
  set(v: string) {
    locale.systemLanguage = v;
  },
};

export const contentLanguage = {
  get value() {
    return locale.contentLanguage;
  },
  set value(v: string) {
    locale.contentLanguage = v;
  },
  set(v: string) {
    locale.contentLanguage = v;
  },
};

export interface LanguageTranslationProgress {
  translated: SvelteSet<string>;
  total: SvelteSet<string>;
  percentage?: number;
}

export type TranslationProgressMap = {
  show?: boolean;
  [locale: string]: LanguageTranslationProgress | boolean | undefined;
};

export function isLanguageProgress(val: unknown): val is LanguageTranslationProgress {
  return typeof val === "object" && val !== null && "translated" in val && "total" in val;
}

// --- Translation Progress ---
let _transProgress = $state<TranslationProgressMap | null>(null);

export const translationProgress = {
  get value(): TranslationProgressMap | null {
    return _transProgress;
  },
  set value(v: TranslationProgressMap | null) {
    _transProgress = v;
  },
  set(v: TranslationProgressMap | null) {
    _transProgress = v;
  },
  markFieldTranslated(locale: string, fieldPath: string) {
    if (!_transProgress) return;
    const langProgress = _transProgress[locale];
    if (!isLanguageProgress(langProgress)) return;
    if (!langProgress.translated) {
      langProgress.translated = new SvelteSet<string>();
    }
    langProgress.translated.add(fieldPath);
    if (!langProgress.total) {
      langProgress.total = new SvelteSet<string>();
    }
    langProgress.total.add(fieldPath);
  },
  markFieldUntranslated(locale: string, fieldPath: string) {
    if (!_transProgress) return;
    const langProgress = _transProgress[locale];
    if (!isLanguageProgress(langProgress)) return;
    if (langProgress.translated) {
      langProgress.translated.delete(fieldPath);
    }
  },
};
