/**
 * @file src/widgets/custom/Address/countryStore.svelte.ts
 * @description Singleton store for efficient country data management.
 *
 * Features:
 * - Lazy loading of full country dataset
 * - Efficient looking up of country names
 * - Shared state across all Address widget instances
 */

import countriesCore from './countries-core.json';

interface Country {
	alpha2: string;
	de: string;
	en: string;
	[key: string]: string | number | undefined;
}

class CountryStore {
	// private state using runes
	private _countries = $state<Country[]>(countriesCore);
	private readonly _loadedLanguages = new Set(['en', 'de']);
	private _loadingPromise: Promise<void> | null = null;

	/**
	 * Get the list of available countries.
	 * This is reactive and will update when new languages are loaded.
	 */
	get countries() {
		return this._countries;
	}

	/**
	 * Ensure that the specified language is available in the country data.
	 * If not, it triggers a lazy load of the full dataset.
	 */
	async ensureLanguageLoaded(lang: string): Promise<void> {
		// Normalization
		const targetLang = lang.toLowerCase();

		// Already have core languages or already loaded
		if (['en', 'de'].includes(targetLang) || this._loadedLanguages.has(targetLang)) {
			return;
		}

		// Prevent duplicate in-flight requests
		if (this._loadingPromise) {
			return this._loadingPromise;
		}

		// Load full countries file
		this._loadingPromise = import('./countries.json')
			.then((module) => {
				// Update the countries state with the full dataset
				this._countries = module.default;

				// Mark all available languages in the full dataset as loaded
				// We assume the first entry represents the schema for all
				if (module.default.length > 0) {
					Object.keys(module.default[0]).forEach((key) => {
						if (key !== 'alpha2' && key !== 'id') {
							this._loadedLanguages.add(key);
						}
					});
				}
			})
			.finally(() => {
				this._loadingPromise = null;
			});

		return this._loadingPromise;
	}

	/**
	 * Get a localized country name.
	 * Falls back gracefully to English or the code if translation is missing.
	 */
	getCountryName(alpha2: string, lang: string): string {
		if (!alpha2) {
			return '';
		}

		const country = this._countries.find((c) => c.alpha2 === alpha2);
		if (!country) {
			return alpha2;
		}

		const val = country[lang] ?? country.en ?? country.de;
		return typeof val === 'string' ? val : alpha2;
	}
}

// Export singleton instance
export const countryStore = new CountryStore();
