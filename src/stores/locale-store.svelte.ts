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

// --- Translation Progress ---
let _transProgress = $state<any>(null);

export const translationProgress = {
  get value() {
    return _transProgress;
  },
  set value(v: any) {
    _transProgress = v;
  },
  set(v: any) {
    _transProgress = v;
  },
  markFieldTranslated(locale: string, fieldPath: string) {
    if (!_transProgress) return;
    const langProgress = _transProgress[locale];
    if (!langProgress) return;
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
    if (!langProgress) return;
    if (langProgress.translated) {
      langProgress.translated.delete(fieldPath);
    }
  },
};
