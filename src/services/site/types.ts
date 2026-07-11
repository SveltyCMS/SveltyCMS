/**
 * @file src/services/site/types.ts
 * @description Type definitions for the optional SvelteKit site starter frontend.
 */

export type SitePageType = "static" | "template";
export type SitePageTemplate = "homepage" | "default" | "search" | "product-detail";

/** JSON block stored in the `content` field (svedit-ready structure). */
export interface SiteContentBlock {
  type: "hero" | "section" | "richtext" | "cta";
  heading?: string;
  subheading?: string;
  body?: string;
  ctaText?: string;
  ctaHref?: string;
}

export interface SitePageContent {
  blocks?: SiteContentBlock[];
}

export interface SitePage {
  _id?: string;
  title?: string | Record<string, string>;
  slug?: string;
  pageType?: SitePageType;
  template?: SitePageTemplate;
  heroHeading?: string | Record<string, string>;
  heroSubheading?: string | Record<string, string>;
  body?: string | Record<string, string>;
  ctaText?: string | Record<string, string>;
  ctaHref?: string;
  content?: SitePageContent | string;
  status?: string;
  seo?: Record<string, unknown>;
}

export interface SiteLayoutData {
  siteName: string;
  isPreview: boolean;
  isDraft: boolean;
  contentLanguage: string;
  siteStarterEnabled: boolean;
}
