/**
 * @file src/routes/setup/market.ts
 * @description First-run market suggestions: country, currency, tax, and the legal page name.
 *
 * The numbers are editable starter suggestions checked on 2026-10-05 against the
 * Haufe EU rate table dated 1 October 2026, plus the same public summaries for
 * the United Kingdom, Switzerland, and Norway. They are not a tax ruling.
 * A blank country or a blank standard rate seeds no tax row.
 *
 * ### Features:
 * - ISO country and currency normalization
 * - Suggested standard and reduced rates the operator can overwrite
 * - Legal-page title for the Website Starter
 * - Scaffold hint parsing for `--template` and `--db`
 */

export const PRESET_IDS = [
  "blank",
  "website",
  "blog",
  "agency",
  "saas",
  "corporate",
  "ecommerce",
] as const;

export type PresetId = (typeof PRESET_IDS)[number];

export interface MarketSuggestion {
  currency: string;
  pricesIncludeTax: boolean;
  storeLanguage: "de" | "en";
  /** Null means "do not seed a tax row". */
  taxRate: number | null;
  reducedRate: number | null;
  legalTitle: string;
  legalSlug: string;
}

interface CountrySeed {
  name: string;
  currency: string;
  pricesIncludeTax: boolean;
  standard: number | null;
  reduced: number | null;
}

/** Standard rate, then the main reduced rate. Greece is stored as ISO `GR`. */
const COUNTRIES: Record<string, CountrySeed> = {
  AT: { name: "Austria", currency: "EUR", pricesIncludeTax: true, standard: 20, reduced: 10 },
  AU: { name: "Australia", currency: "AUD", pricesIncludeTax: true, standard: 10, reduced: null },
  BE: { name: "Belgium", currency: "EUR", pricesIncludeTax: true, standard: 21, reduced: 6 },
  BG: { name: "Bulgaria", currency: "BGN", pricesIncludeTax: true, standard: 20, reduced: 9 },
  CA: { name: "Canada", currency: "CAD", pricesIncludeTax: false, standard: null, reduced: null },
  CH: { name: "Switzerland", currency: "CHF", pricesIncludeTax: true, standard: 8.1, reduced: 2.6 },
  CY: { name: "Cyprus", currency: "EUR", pricesIncludeTax: true, standard: 19, reduced: 5 },
  CZ: { name: "Czechia", currency: "CZK", pricesIncludeTax: true, standard: 21, reduced: 12 },
  DE: { name: "Germany", currency: "EUR", pricesIncludeTax: true, standard: 19, reduced: 7 },
  DK: { name: "Denmark", currency: "DKK", pricesIncludeTax: true, standard: 25, reduced: null },
  EE: { name: "Estonia", currency: "EUR", pricesIncludeTax: true, standard: 24, reduced: 9 },
  ES: { name: "Spain", currency: "EUR", pricesIncludeTax: true, standard: 21, reduced: 10 },
  FI: { name: "Finland", currency: "EUR", pricesIncludeTax: true, standard: 25.5, reduced: 13.5 },
  FR: { name: "France", currency: "EUR", pricesIncludeTax: true, standard: 20, reduced: 5.5 },
  GB: { name: "United Kingdom", currency: "GBP", pricesIncludeTax: true, standard: 20, reduced: 5 },
  GR: { name: "Greece", currency: "EUR", pricesIncludeTax: true, standard: 24, reduced: 13 },
  HR: { name: "Croatia", currency: "EUR", pricesIncludeTax: true, standard: 25, reduced: 13 },
  HU: { name: "Hungary", currency: "HUF", pricesIncludeTax: true, standard: 27, reduced: 18 },
  IE: { name: "Ireland", currency: "EUR", pricesIncludeTax: true, standard: 23, reduced: 13.5 },
  IT: { name: "Italy", currency: "EUR", pricesIncludeTax: true, standard: 22, reduced: 10 },
  JP: { name: "Japan", currency: "JPY", pricesIncludeTax: true, standard: 10, reduced: 8 },
  LT: { name: "Lithuania", currency: "EUR", pricesIncludeTax: true, standard: 21, reduced: 12 },
  LU: { name: "Luxembourg", currency: "EUR", pricesIncludeTax: true, standard: 17, reduced: 8 },
  LV: { name: "Latvia", currency: "EUR", pricesIncludeTax: true, standard: 21, reduced: 12 },
  MT: { name: "Malta", currency: "EUR", pricesIncludeTax: true, standard: 18, reduced: 5 },
  NL: { name: "Netherlands", currency: "EUR", pricesIncludeTax: true, standard: 21, reduced: 9 },
  NO: { name: "Norway", currency: "NOK", pricesIncludeTax: true, standard: 25, reduced: 15 },
  NZ: { name: "New Zealand", currency: "NZD", pricesIncludeTax: true, standard: 15, reduced: null },
  PL: { name: "Poland", currency: "PLN", pricesIncludeTax: true, standard: 23, reduced: 8 },
  PT: { name: "Portugal", currency: "EUR", pricesIncludeTax: true, standard: 23, reduced: 13 },
  RO: { name: "Romania", currency: "RON", pricesIncludeTax: true, standard: 21, reduced: 11 },
  SE: { name: "Sweden", currency: "SEK", pricesIncludeTax: true, standard: 25, reduced: 12 },
  SI: { name: "Slovenia", currency: "EUR", pricesIncludeTax: true, standard: 22, reduced: 9.5 },
  SK: { name: "Slovakia", currency: "EUR", pricesIncludeTax: true, standard: 23, reduced: 19 },
  US: {
    name: "United States",
    currency: "USD",
    pricesIncludeTax: false,
    standard: null,
    reduced: null,
  },
};

const LEGAL: Record<string, { title: string; slug: string }> = {
  AT: { title: "Impressum", slug: "impressum" },
  CH: { title: "Impressum", slug: "impressum" },
  DE: { title: "Impressum", slug: "impressum" },
  ES: { title: "Aviso legal", slug: "aviso-legal" },
  FR: { title: "Mentions légales", slug: "mentions-legales" },
  IT: { title: "Note legali", slug: "note-legali" },
  NL: { title: "Bedrijfsgegevens", slug: "bedrijfsgegevens" },
};

const OPEN_LEGAL = { title: "Legal notice", slug: "legal" };

export function normalizeCountry(raw: unknown): string {
  const code = String(raw ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

export function normalizeCurrency(raw: unknown): string {
  const code = String(raw ?? "")
    .trim()
    .toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : "";
}

export function countryOptions(): Array<{ value: string; label: string }> {
  const rows = Object.entries(COUNTRIES)
    .map(([value, row]) => ({ value, label: `${row.name} (${value})` }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [{ value: "", label: "Choose later" }, ...rows];
}

export function suggestMarket(countryRaw: unknown, contentLanguageRaw?: unknown): MarketSuggestion {
  const country = normalizeCountry(countryRaw);
  const known = country ? COUNTRIES[country] : undefined;
  const content = String(contentLanguageRaw ?? "")
    .trim()
    .toLowerCase();
  const germanShop =
    content.startsWith("de") || country === "DE" || country === "AT" || country === "CH";
  const legal = (country && LEGAL[country]) || OPEN_LEGAL;
  return {
    currency: known?.currency ?? "EUR",
    pricesIncludeTax: known?.pricesIncludeTax ?? true,
    storeLanguage: germanShop ? "de" : "en",
    taxRate: known?.standard ?? null,
    reducedRate: known?.reduced ?? null,
    legalTitle: legal.title,
    legalSlug: legal.slug,
  };
}

export function legalPageBody(siteName: string, countryRaw: unknown): string {
  const site = siteName.trim() || "this site";
  const country = normalizeCountry(countryRaw);
  const english = `<p>Replace this page with the name, address, and contact details of ${site}.</p>`;
  if (country === "DE" || country === "AT" || country === "CH") {
    return `${english}<p>Ersetzen Sie diese Seite durch Name, Anschrift und Kontakt des Betreibers.</p>`;
  }
  if (country === "FR") {
    return `${english}<p>Remplacez cette page par le nom, l'adresse et le contact de l'éditeur.</p>`;
  }
  if (country === "ES") {
    return `${english}<p>Sustituya esta página por el nombre, la dirección y el contacto del titular.</p>`;
  }
  if (country === "IT") {
    return `${english}<p>Sostituire questa pagina con nome, indirizzo e contatto del titolare.</p>`;
  }
  if (country === "NL") {
    return `${english}<p>Vervang deze pagina door de naam, het adres en het contact van de exploitant.</p>`;
  }
  return english;
}

export interface InstallMarketInput {
  homeCountry?: unknown;
  currency?: unknown;
  pricesIncludeTax?: unknown;
  storeLanguage?: unknown;
  taxRate?: unknown;
  reducedRate?: unknown;
  defaultContentLanguage?: unknown;
}

export interface InstallMarket {
  homeCountry: string;
  currency: string;
  pricesIncludeTax: boolean;
  storeLanguage: "de" | "en";
  taxRate: number | null;
  reducedRate: number | null;
  legalTitle: string;
  legalSlug: string;
}

function optionalRate(raw: unknown): number | null {
  if (raw == null || raw === "") return null;
  const value = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

/** Form values win. Empty currency or store language falls back to the country suggestion. */
export function marketFromForm(input: InstallMarketInput): InstallMarket {
  const suggestion = suggestMarket(input.homeCountry, input.defaultContentLanguage);
  const currency = normalizeCurrency(input.currency) || suggestion.currency;
  const storeRaw = String(input.storeLanguage ?? "")
    .trim()
    .toLowerCase();
  const storeLanguage: "de" | "en" =
    storeRaw === "de" || storeRaw === "en" ? storeRaw : suggestion.storeLanguage;
  return {
    homeCountry: normalizeCountry(input.homeCountry),
    currency,
    pricesIncludeTax: input.pricesIncludeTax !== false,
    storeLanguage,
    taxRate: optionalRate(input.taxRate),
    reducedRate: optionalRate(input.reducedRate),
    legalTitle: suggestion.legalTitle,
    legalSlug: suggestion.legalSlug,
  };
}

export function isPresetId(value: unknown): value is PresetId {
  return typeof value === "string" && (PRESET_IDS as readonly string[]).includes(value);
}

export interface DbHintPatch {
  type: "sqlite" | "postgresql" | "mariadb" | "mongodb" | "mongodb+srv";
  host: string;
  port: string;
  name: string;
}

export function dbConfigForHint(raw: unknown): DbHintPatch | null {
  const db = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (db === "sqlite")
    return { type: "sqlite", host: "config/database", port: "", name: "sveltycms.db" };
  if (db === "postgresql" || db === "postgres") {
    return { type: "postgresql", host: "localhost", port: "5432", name: "sveltycms" };
  }
  if (db === "mariadb" || db === "mysql") {
    return { type: "mariadb", host: "localhost", port: "3306", name: "sveltycms" };
  }
  if (db === "mongodb")
    return { type: "mongodb", host: "localhost", port: "27017", name: "sveltycms" };
  if (db === "mongodb+srv" || db === "atlas") {
    return { type: "mongodb+srv", host: "", port: "", name: "sveltycms" };
  }
  return null;
}
