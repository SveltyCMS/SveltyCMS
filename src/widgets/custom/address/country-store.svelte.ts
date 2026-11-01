/**
 * @file src/widgets/custom/address/country-store.svelte.ts
 * @description Singleton store for zero-bundle localized country name management.
 *
 * Features:
 * - Native `Intl.DisplayNames` region localization across all browser/runtime locales
 * - Zero-bundle fallback to `countries-core.json` (eliminating 220 KB `countries.json`)
 * - Shared state across all Address widget instances
 */

import countriesCore from "./countries-core.json";

interface Country {
  alpha2: string;
  de: string;
  en: string;
  [key: string]: string | number | undefined;
}

class CountryStore {
  // private state using runes
  private readonly _countries = $state<Country[]>(countriesCore);
  private readonly _displayNamesCache = new Map<string, Intl.DisplayNames | null>();

  /**
   * Get the list of available countries.
   */
  get countries() {
    return this._countries;
  }

  /**
   * Resolve a cached `Intl.DisplayNames` instance for region codes in `lang`.
   */
  private _getRegionDisplayNames(lang: string): Intl.DisplayNames | null {
    const normalized = (lang || "en").toLowerCase();
    if (this._displayNamesCache.has(normalized)) {
      return this._displayNamesCache.get(normalized) ?? null;
    }
    try {
      if (typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
        const dn = new Intl.DisplayNames([normalized], { type: "region" });
        this._displayNamesCache.set(normalized, dn);
        return dn;
      }
    } catch {
      // Invalid locale tag — fall back to core table below
    }
    this._displayNamesCache.set(normalized, null);
    return null;
  }

  /**
   * Get a localized country name.
   * Uses native `Intl.DisplayNames` for non-EN/DE locales and falls back gracefully
   * to `countries-core.json` or the ISO alpha-2 code.
   */
  getCountryName(alpha2: string, lang: string): string {
    if (!alpha2) {
      return "";
    }

    const lowerCode = alpha2.toLowerCase();
    const targetLang = (lang || "en").toLowerCase();

    if (targetLang !== "en" && targetLang !== "de") {
      const dn = this._getRegionDisplayNames(targetLang);
      if (dn) {
        try {
          const localized = dn.of(alpha2.toUpperCase());
          if (localized && localized.toLowerCase() !== lowerCode) {
            return localized;
          }
        } catch {
          // Fall through to core lookup
        }
      }
    }

    const country = this._countries.find((c) => c.alpha2 === lowerCode);
    if (!country) {
      return alpha2;
    }

    const val = country[targetLang] ?? country.en ?? country.de;
    return typeof val === "string" ? val : alpha2;
  }
}

// Export singleton instance
export const countryStore = new CountryStore();
