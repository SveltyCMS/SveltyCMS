/**
 * @file src/plugins/smart-importer/utils/token-mapper.ts
 * @description Token replacement engine for migrations.
 *
 * During import, detects source platform tokens/shortcodes/placeholders
 * and converts them to SveltyCMS token syntax so imported content
 * is immediately dynamic in the target CMS.
 *
 * Supported source token systems:
 *   WordPress:   shortcodes [year], [site_title], [current_date], [the_author], etc.
 *   Drupal:      [current-date:html_date], [site:name], [node:title], [user:display-name]
 *   Joomla:      {year}, {sitename}, {date}, etc.
 *   Shopify:     {{ product.title }}, {{ shop.name }} (Liquid)
 *   Ghost:       {{@site.title}}, {{date format="YYYY"}} (Handlebars)
 *   Contentful:  {entry.fields.title} (GraphQL-style)
 *   Generic:     %YEAR%, %SITE_NAME%, {title}, [title], ${title}
 */

import {} from "@utils/logger";

// ============================================================================
// Token Mapping Tables
// ============================================================================

export interface TokenMapping {
  /** Source pattern (regex or literal) */
  source: RegExp | string;
  /** SveltyCMS target token */
  target: string;
  /** Optional transform to apply to the value */
  transform?: string;
  /** Description for debugging */
  description: string;
}

/**
 * WordPress shortcode → SveltyCMS token mappings
 */
const WORDPRESS_TOKENS: TokenMapping[] = [
  { source: /\[year\]/gi, target: "{{ system.year }}", description: "Current year" },
  { source: /\[site_title\]/gi, target: "{{ site.SITE_NAME }}", description: "Site name" },
  {
    source: /\[current_date(?:\s+format="([^"]*)")?\]/gi,
    target: '{{ system.now | date("$1") }}',
    description: "Current date",
  },
  { source: /\[the_author\]/gi, target: "{{ entry.author }}", description: "Entry author" },
  { source: /\[the_title\]/gi, target: "{{ entry.title }}", description: "Entry title" },
  { source: /\[the_permalink\]/gi, target: "{{ entry.slug }}", description: "Entry URL" },
  { source: /\[the_excerpt\]/gi, target: "{{ entry.excerpt }}", description: "Entry excerpt" },
  { source: /\[the_content\]/gi, target: "{{ entry.content }}", description: "Entry content" },
  { source: /\[bloginfo\s+name\]/gi, target: "{{ site.SITE_NAME }}", description: "Site name" },
  { source: /\[bloginfo\s+url\]/gi, target: "{{ site.HOST_PROD }}", description: "Site URL" },
  {
    source: /\[bloginfo\s+description\]/gi,
    target: "{{ site.SITE_DESCRIPTION }}",
    description: "Site description",
  },
  {
    source: /\[bloginfo\s+admin_email\]/gi,
    target: "{{ site.ADMIN_EMAIL }}",
    description: "Admin email",
  },
  {
    source: /\[user_display_name\]/gi,
    target: "{{ user.name }}",
    description: "User display name",
  },
  { source: /\[user_email\]/gi, target: "{{ user.email }}", description: "User email" },
  { source: /\[user_role\]/gi, target: "{{ user.role }}", description: "User role" },
];

/**
 * Drupal token → SveltyCMS token mappings
 */
const DRUPAL_TOKENS: TokenMapping[] = [
  {
    source: /\[current-date:html_date\]/gi,
    target: '{{ system.now | date("MMM do, yyyy") }}',
    description: "Formatted date",
  },
  {
    source: /\[current-date:custom:Y\]/gi,
    target: "{{ system.year }}",
    description: "Current year",
  },
  {
    source: /\[current-date:custom:Y-m-d\]/gi,
    target: '{{ system.now | date("yyyy-MM-dd") }}',
    description: "ISO date",
  },
  { source: /\[site:name\]/gi, target: "{{ site.SITE_NAME }}", description: "Site name" },
  {
    source: /\[site:slogan\]/gi,
    target: "{{ site.SITE_DESCRIPTION }}",
    description: "Site slogan",
  },
  { source: /\[site:mail\]/gi, target: "{{ site.ADMIN_EMAIL }}", description: "Site email" },
  { source: /\[site:url\]/gi, target: "{{ site.HOST_PROD }}", description: "Site URL" },
  { source: /\[node:title\]/gi, target: "{{ entry.title }}", description: "Node title" },
  {
    source: /\[node:created:custom:Y-m-d\]/gi,
    target: '{{ entry.createdAt | date("yyyy-MM-dd") }}',
    description: "Node created date",
  },
  {
    source: /\[node:changed:custom:Y-m-d\]/gi,
    target: '{{ entry.updatedAt | date("yyyy-MM-dd") }}',
    description: "Node updated date",
  },
  {
    source: /\[node:author:display-name\]/gi,
    target: "{{ entry.author }}",
    description: "Node author",
  },
  {
    source: /\[user:display-name\]/gi,
    target: "{{ user.name }}",
    description: "User display name",
  },
  { source: /\[user:mail\]/gi, target: "{{ user.email }}", description: "User email" },
  { source: /\[user:roles\]/gi, target: "{{ user.role }}", description: "User role" },
];

/**
 * Joomla placeholder → SveltyCMS token mappings
 */
const JOOMLA_TOKENS: TokenMapping[] = [
  { source: /\{year\}/gi, target: "{{ system.year }}", description: "Current year" },
  { source: /\{sitename\}/gi, target: "{{ site.SITE_NAME }}", description: "Site name" },
  {
    source: /\{date\}/gi,
    target: '{{ system.now | date("yyyy-MM-dd") }}',
    description: "Current date",
  },
  { source: /\{title\}/gi, target: "{{ entry.title }}", description: "Entry title" },
  { source: /\{author\}/gi, target: "{{ entry.author }}", description: "Entry author" },
  { source: /\{email\}/gi, target: "{{ user.email }}", description: "User email" },
];

/**
 * Shopify Liquid → SveltyCMS token mappings
 */
const SHOPIFY_TOKENS: TokenMapping[] = [
  {
    source: /\{\{\s*product\.title\s*\}\}/gi,
    target: "{{ entry.title }}",
    description: "Product title",
  },
  {
    source: /\{\{\s*product\.description\s*\}\}/gi,
    target: "{{ entry.content }}",
    description: "Product description",
  },
  {
    source: /\{\{\s*product\.price\s*\|\s*money\s*\}\}/gi,
    target: "{{ entry.price }}",
    description: "Product price",
  },
  {
    source: /\{\{\s*product\.vendor\s*\}\}/gi,
    target: "{{ entry.vendor }}",
    description: "Product vendor",
  },
  {
    source: /\{\{\s*product\.type\s*\}\}/gi,
    target: "{{ entry.productType }}",
    description: "Product type",
  },
  {
    source: /\{\{\s*shop\.name\s*\}\}/gi,
    target: "{{ site.SITE_NAME }}",
    description: "Shop name",
  },
  {
    source: /\{\{\s*shop\.email\s*\}\}/gi,
    target: "{{ site.ADMIN_EMAIL }}",
    description: "Shop email",
  },
  {
    source: /\{\{\s*'now'\s*\|\s*date:\s*"%Y"\s*\}\}/gi,
    target: "{{ system.year }}",
    description: "Current year",
  },
];

/**
 * Ghost Handlebars → SveltyCMS token mappings
 */
const GHOST_TOKENS: TokenMapping[] = [
  { source: /\{\{@site\.title\}\}/gi, target: "{{ site.SITE_NAME }}", description: "Site title" },
  {
    source: /\{\{@site\.description\}\}/gi,
    target: "{{ site.SITE_DESCRIPTION }}",
    description: "Site description",
  },
  { source: /\{\{@site\.url\}\}/gi, target: "{{ site.HOST_PROD }}", description: "Site URL" },
  { source: /\{\{title\}\}/gi, target: "{{ entry.title }}", description: "Post title" },
  { source: /\{\{excerpt\}\}/gi, target: "{{ entry.excerpt }}", description: "Post excerpt" },
  {
    source: /\{\{date\s+format="YYYY"\}\}/gi,
    target: "{{ system.year }}",
    description: "Current year",
  },
  {
    source: /\{\{authors\s+limit="1"\}\}\{\{name\}\}\{\{\/authors\}\}/gi,
    target: "{{ entry.author }}",
    description: "Author name",
  },
  {
    source: /\{\{primary_author\.name\}\}/gi,
    target: "{{ entry.author }}",
    description: "Primary author",
  },
];

/**
 * Contentful GraphQL-style → SveltyCMS token mappings
 */
const CONTENTFUL_TOKENS: TokenMapping[] = [
  { source: /\{entry\.fields\.title\}/gi, target: "{{ entry.title }}", description: "Entry title" },
  { source: /\{entry\.fields\.slug\}/gi, target: "{{ entry.slug }}", description: "Entry slug" },
  {
    source: /\{entry\.sys\.createdAt\}/gi,
    target: "{{ entry.createdAt }}",
    description: "Entry created date",
  },
  {
    source: /\{entry\.sys\.updatedAt\}/gi,
    target: "{{ entry.updatedAt }}",
    description: "Entry updated date",
  },
];

/**
 * Generic placeholder patterns → SveltyCMS token mappings
 * Catches %VAR%, {var}, [var], ${var} patterns
 */
const GENERIC_TOKENS: TokenMapping[] = [
  { source: /%YEAR%/gi, target: "{{ system.year }}", description: "Current year" },
  {
    source: /%DATE%/gi,
    target: '{{ system.now | date("yyyy-MM-dd") }}',
    description: "Current date",
  },
  { source: /%SITE_NAME%/gi, target: "{{ site.SITE_NAME }}", description: "Site name" },
  { source: /%SITE_URL%/gi, target: "{{ site.HOST_PROD }}", description: "Site URL" },
  { source: /%TITLE%/gi, target: "{{ entry.title }}", description: "Entry title" },
  { source: /%AUTHOR%/gi, target: "{{ entry.author }}", description: "Entry author" },
  { source: /%EMAIL%/gi, target: "{{ user.email }}", description: "User email" },
  { source: /\$\{year\}/gi, target: "{{ system.year }}", description: "Current year" },
  { source: /\$\{title\}/gi, target: "{{ entry.title }}", description: "Entry title" },
];

// ============================================================================
// Token Mapping Registry
// ============================================================================

const PLATFORM_TOKEN_MAPS: Record<string, TokenMapping[]> = {
  wordpress: WORDPRESS_TOKENS,
  drupal: DRUPAL_TOKENS,
  joomla: JOOMLA_TOKENS,
  shopify: SHOPIFY_TOKENS,
  ghost: GHOST_TOKENS,
  contentful: CONTENTFUL_TOKENS,
};

// Always apply generic mappings as fallback
const ALL_TOKENS = (platform: string): TokenMapping[] => {
  return [...(PLATFORM_TOKEN_MAPS[platform] || []), ...GENERIC_TOKENS];
};

// ============================================================================
// Token Replacement Engine
// ============================================================================

export interface TokenReplacementResult {
  original: string;
  replaced: string;
  replacements: number;
  details: Array<{ source: string; target: string; description: string }>;
}

/**
 * Replaces source platform tokens with SveltyCMS tokens in content.
 * Preserves existing SveltyCMS tokens ({{ ... }}) untouched.
 */
export function replaceTokens(content: string, sourcePlatform: string): TokenReplacementResult {
  if (!content) return { original: "", replaced: "", replacements: 0, details: [] };

  let replaced = content;
  const details: TokenReplacementResult["details"] = [];
  const tokens = ALL_TOKENS(sourcePlatform);

  // Protect existing SveltyCMS tokens from being modified
  const protectedTokens: string[] = [];
  replaced = replaced.replace(/\{\{[\s\S]*?\}\}/g, (match) => {
    protectedTokens.push(match);
    return `__SVLTY_TOKEN_${protectedTokens.length - 1}__`;
  });

  // Apply platform-specific token mappings
  for (const mapping of tokens) {
    const before = replaced;
    if (mapping.source instanceof RegExp) {
      // Handle regex with capture groups for format parameters
      replaced = replaced.replace(mapping.source, (match, ...captureGroups) => {
        // Substitute $1, $2, etc. in the target with capture groups
        let target = mapping.target;
        for (let i = 0; i < captureGroups.length; i++) {
          if (typeof captureGroups[i] === "string") {
            target = target.replace(`$${i + 1}`, captureGroups[i]);
          }
        }
        return target;
      });
    } else {
      replaced = replaced.split(mapping.source).join(mapping.target);
    }

    if (replaced !== before) {
      details.push({
        source: mapping.source instanceof RegExp ? mapping.source.source : mapping.source,
        target: mapping.target,
        description: mapping.description,
      });
    }
  }

  // Restore protected SveltyCMS tokens
  replaced = replaced.replace(/__SVLTY_TOKEN_(\d+)__/g, (_, idx) => {
    return protectedTokens[parseInt(idx)] || "";
  });

  const replacements = details.length;

  if (replacements > 0) {
    logger.info(`[TokenMapper] ${sourcePlatform}: ${replacements} token replacement(s) applied`);
  }

  return {
    original: content,
    replaced,
    replacements,
    details,
  };
}

/**
 * Replaces tokens across all text fields in an SNC entry.
 * Modifies: title, content, excerpt, and all string values in rawCustomFields.
 */
export function replaceTokensInEntry(
  entry: {
    title: string;
    content?: string;
    excerpt?: string;
    rawCustomFields: Record<string, unknown>;
  },
  sourcePlatform: string,
): {
  title: string;
  content?: string;
  excerpt?: string;
  rawCustomFields: Record<string, unknown>;
  totalReplacements: number;
  details: TokenReplacementResult["details"];
} {
  let totalReplacements = 0;
  const allDetails: TokenReplacementResult["details"] = [];

  // Title
  const titleResult = replaceTokens(entry.title, sourcePlatform);
  const newTitle = titleResult.replaced;
  totalReplacements += titleResult.replacements;
  allDetails.push(...titleResult.details);

  // Content
  let newContent = entry.content;
  if (entry.content) {
    const contentResult = replaceTokens(entry.content, sourcePlatform);
    newContent = contentResult.replaced;
    totalReplacements += contentResult.replacements;
    allDetails.push(...contentResult.details);
  }

  // Excerpt
  let newExcerpt = entry.excerpt;
  if (entry.excerpt) {
    const excerptResult = replaceTokens(entry.excerpt, sourcePlatform);
    newExcerpt = excerptResult.replaced;
    totalReplacements += excerptResult.replacements;
    allDetails.push(...excerptResult.details);
  }

  // Custom fields (only string values)
  const newCustomFields = { ...entry.rawCustomFields };
  for (const [key, value] of Object.entries(newCustomFields)) {
    if (typeof value === "string" && !key.startsWith("_")) {
      const fieldResult = replaceTokens(value, sourcePlatform);
      if (fieldResult.replacements > 0) {
        newCustomFields[key] = fieldResult.replaced;
        totalReplacements += fieldResult.replacements;
        allDetails.push(...fieldResult.details);
      }
    }
  }

  return {
    title: newTitle,
    content: newContent,
    excerpt: newExcerpt,
    rawCustomFields: newCustomFields,
    totalReplacements,
    details: allDetails,
  };
}

/**
 * Detects what token system a piece of content uses.
 * Useful for auto-detection mode.
 */
export function detectTokenSystem(content: string): string | null {
  if (!content) return null;

  if (/\[year\]|\[site_title\]|\[the_author\]/i.test(content)) return "wordpress";
  if (/\[current-date:|\[site:name\]|\[node:title\]/i.test(content)) return "drupal";
  if (/\{year\}|\{sitename\}/i.test(content)) return "joomla";
  if (/\{\{\s*product\.|\{\{\s*shop\./i.test(content)) return "shopify";
  if (/\{\{@site\.|\{\{primary_author\./i.test(content)) return "ghost";
  if (/%YEAR%|%SITE_NAME%/i.test(content)) return "generic";
  if (/\{\{[^}]+\}\}/i.test(content)) return "sveltycms"; // Already SveltyCMS tokens

  return null;
}

/**
 * Token replacement statistics for reporting.
 */
export function getTokenStats(
  entries: Array<{ content?: string; rawCustomFields: Record<string, unknown> }>,
  sourcePlatform: string,
): {
  entriesWithTokens: number;
  totalReplacements: number;
  tokenTypes: Record<string, number>;
} {
  let entriesWithTokens = 0;
  let totalReplacements = 0;
  const tokenTypes: Record<string, number> = {};

  for (const entry of entries) {
    const allText = [
      entry.content || "",
      ...Object.values(entry.rawCustomFields).filter((v) => typeof v === "string"),
    ].join(" ");

    const result = replaceTokens(allText, sourcePlatform);
    if (result.replacements > 0) {
      entriesWithTokens++;
      totalReplacements += result.replacements;
      for (const detail of result.details) {
        tokenTypes[detail.description] = (tokenTypes[detail.description] || 0) + 1;
      }
    }
  }

  return { entriesWithTokens, totalReplacements, tokenTypes };
}
