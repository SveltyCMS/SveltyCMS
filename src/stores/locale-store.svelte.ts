/**
 * @file src/stores/locale-store.svelte.ts
 * @description Reactive locale state — system language, content language, and translation progress.
 *
 * Features:
 * - systemLanguage / contentLanguage via AppStore singleton
 * - translationProgress with per-field localization tracking
 */

import { SvelteSet } from "svelte/reactivity";

// --- AppStore language accessors (owned by store.svelte.ts, re-exported here) ---
// These are thin accessors — the actual state lives in the AppStore class in store.svelte.ts
// to avoid a circular dependency during migration.

let _systemLanguage = $state("en");
let _contentLanguage = $state("en");

export const systemLanguage = {
  get value() {
    return _systemLanguage;
  },
  set value(v: string) {
    _systemLanguage = v;
  },
  set(v: string) {
    _systemLanguage = v;
  },
};

export const contentLanguage = {
  get value() {
    return _contentLanguage;
  },
  set value(v: string) {
    _contentLanguage = v;
  },
  set(v: string) {
    _contentLanguage = v;
  },
};

/** @internal — synced from AppStore by store.svelte.ts module init */
export function _syncLanguageState(sys: string, content: string) {
  _systemLanguage = sys;
  _contentLanguage = content;
}

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
