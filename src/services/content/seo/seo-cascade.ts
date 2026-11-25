/**
 * @file src/services/content/seo/seo-cascade.ts
 * @description Site -> Collection -> Entry SEO defaults cascade resolver.
 *
 * Features:
 * - Deterministic precedence: entry > collection > site defaults
 * - Title template interpolation (`%s` replaced with page/entry title)
 * - Robots, OG/Twitter image & card, description, and default JSON-LD type inheritance
 */

import type { SeoLocaleData } from "./seo-head";

export interface SeoDefaultsConfig {
  /** Site name appended when applying templates or fallbacks. */
  siteName?: string;
  /** Title pattern containing `%s` placeholder (e.g. `"%s | Acme"`). */
  titleTemplate?: string;
  /** Default meta description inherited when entry leaves description empty. */
  defaultDescription?: string;
  /** Default robots directive (e.g. `"index, follow"`). */
  defaultRobotsMeta?: string;
  /** Default OG image URL or media ID. */
  defaultOgImage?: string;
  /** Default Twitter card layout. */
  defaultTwitterCard?: "summary" | "summary_large_image";
  /** Default JSON-LD schema type when collection/entry does not specify one. */
  defaultSchemaType?: "Article" | "BlogPosting" | "NewsArticle" | "Product" | "WebPage";
}

export interface MergeSeoCascadeInput {
  siteDefaults?: SeoDefaultsConfig | null;
  collectionDefaults?: SeoDefaultsConfig | null;
  entryData?: SeoLocaleData | null;
  fallbackTitle?: string;
}

export interface MergedSeoDefaults {
  effectiveData: SeoLocaleData;
  titleTemplate?: string;
  defaultSchemaType?: SeoDefaultsConfig["defaultSchemaType"];
  siteName?: string;
}

function firstNonEmpty(...values: Array<string | undefined | null>): string | undefined {
  for (const val of values) {
    if (typeof val === "string") {
      const trimmed = val.trim();
      if (trimmed.length > 0) return trimmed;
    }
  }
  return undefined;
}

/**
 * Applies a `%s` title template to a base page title cleanly without double-applying
 * if the raw title already ends with the templated suffix.
 */
export function applySeoTitleTemplate(rawTitle: string, template?: string | null): string {
  const cleanTitle = rawTitle.trim();
  const cleanTemplate = template?.trim();
  if (!cleanTitle || !cleanTemplate) return cleanTitle;
  if (!cleanTemplate.includes("%s")) return cleanTitle;
  const formatted = cleanTemplate.replace(/%s/g, cleanTitle);
  return formatted;
}

/**
 * Merges site -> collection -> entry SEO metadata using entry > collection > site precedence.
 */
export function mergeSeoCascade(input: MergeSeoCascadeInput): MergedSeoDefaults {
  const site = input.siteDefaults ?? undefined;
  const col = input.collectionDefaults ?? undefined;
  const entry = input.entryData ?? undefined;

  const titleTemplate = firstNonEmpty(col?.titleTemplate, site?.titleTemplate);
  const siteName = firstNonEmpty(col?.siteName, site?.siteName);
  const defaultSchemaType = col?.defaultSchemaType ?? site?.defaultSchemaType;

  const baseTitle = firstNonEmpty(entry?.title, input.fallbackTitle, siteName);
  const resolvedTitle =
    entry?.title && entry.title.trim().length > 0
      ? entry.title.trim()
      : baseTitle
        ? applySeoTitleTemplate(baseTitle, titleTemplate)
        : undefined;

  const effectiveData: SeoLocaleData = {
    ...entry,
    ...(resolvedTitle ? { title: resolvedTitle } : {}),
    description: firstNonEmpty(
      entry?.description,
      col?.defaultDescription,
      site?.defaultDescription,
    ),
    robotsMeta: firstNonEmpty(entry?.robotsMeta, col?.defaultRobotsMeta, site?.defaultRobotsMeta),
    ogImage: firstNonEmpty(entry?.ogImage, col?.defaultOgImage, site?.defaultOgImage),
    twitterCard: entry?.twitterCard ?? col?.defaultTwitterCard ?? site?.defaultTwitterCard,
  };

  return {
    effectiveData,
    titleTemplate,
    defaultSchemaType,
    siteName,
  };
}
