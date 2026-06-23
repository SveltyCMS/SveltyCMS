/**
 * @file src/plugins/smart-importer/parsers/index.ts
 * @description Master parser dispatcher — routes to the correct platform-specific parser.
 *
 * Platform coverage:
 *   WordPress:    parsers/wordpress.ts  (WXR XML)
 *   Drupal:       parsers/drupal.ts     (JSON:API, YAML, CSV)
 *   Headless:     parsers/headless.ts   (Contentful, Sanity, Strapi, Directus, Payload, Storyblok, Prismic)
 *   E-commerce:   parsers/ecommerce.ts  (Shopify, Magento, PrestaShop, OpenCart)
 *   SaaS:         parsers/saas.ts       (Ghost, Webflow, HubSpot, Wix, Squarespace, Duda, Tilda, Builder)
 *   PHP CMS:      parsers/php-cms.ts    (Joomla, TYPO3, Craft, Grav + 12 others)
 *   Universal:    parsers/universal.ts  (CSV, Markdown, SQL, API, Notion, Airtable, MongoDB)
 */

import type { SNCEnvelope } from "../types";
import { logger } from "@utils/logger";

// ============================================================================
// Dispatcher
// ============================================================================

/**
 * Routes raw file text to the correct platform-specific parser.
 * Returns SNCEnvelope ready for the UCP ingestion pipeline.
 */
export async function parseFileToSNC(
  rawText: string,
  platform: string,
  transactionToken: string,
): Promise<SNCEnvelope | null> {
  const start = Date.now();

  let envelope: SNCEnvelope | null = null;

  switch (platform) {
    // ── WordPress ──
    case "wordpress": {
      const { parseWordPressWXR } = await import("./wordpress");
      envelope = parseWordPressWXR(rawText, transactionToken);
      break;
    }

    // ── Drupal ──
    case "drupal": {
      const { parseDrupalJSONAPI, parseDrupalYAML, parseDrupalCSV } = await import("./drupal");
      if (rawText.trim().startsWith("{")) {
        envelope = parseDrupalJSONAPI(rawText, transactionToken);
      } else if (rawText.includes(",")) {
        envelope = parseDrupalCSV(rawText, transactionToken);
      } else {
        envelope = parseDrupalYAML(rawText, transactionToken);
      }
      break;
    }

    // ── Headless CMS ──
    case "contentful": {
      const { parseContentfulExport } = await import("./headless");
      envelope = parseContentfulExport(rawText, transactionToken);
      break;
    }
    case "sanity": {
      const { parseSanityExport } = await import("./headless");
      envelope = parseSanityExport(rawText, transactionToken);
      break;
    }
    case "strapi": {
      const { parseStrapiExport } = await import("./headless");
      envelope = parseStrapiExport(rawText, transactionToken);
      break;
    }
    case "directus": {
      const { parseDirectusExport } = await import("./headless");
      envelope = parseDirectusExport(rawText, transactionToken);
      break;
    }
    case "payload": {
      const { parsePayloadExport } = await import("./headless");
      envelope = parsePayloadExport(rawText, transactionToken);
      break;
    }
    case "storyblok": {
      const { parseStoryblokExport } = await import("./headless");
      envelope = parseStoryblokExport(rawText, transactionToken);
      break;
    }
    case "prismic": {
      const { parsePrismicExport } = await import("./headless");
      envelope = parsePrismicExport(rawText, transactionToken);
      break;
    }

    // ── E-commerce ──
    case "shopify": {
      const { parseShopifyExport } = await import("./ecommerce");
      envelope = parseShopifyExport(rawText, transactionToken);
      break;
    }
    case "magento": {
      const { parseMagentoExport } = await import("./ecommerce");
      envelope = parseMagentoExport(rawText, transactionToken);
      break;
    }
    case "prestashop": {
      const { parsePrestaShopExport } = await import("./ecommerce");
      envelope = parsePrestaShopExport(rawText, transactionToken);
      break;
    }
    case "opencart": {
      const { parseOpenCartExport } = await import("./ecommerce");
      const format = rawText.trim().startsWith("{") ? "json" : "csv";
      envelope = parseOpenCartExport(rawText, transactionToken, format);
      break;
    }

    // ── SaaS / Builders ──
    case "ghost": {
      const { parseGhostExport } = await import("./saas");
      envelope = parseGhostExport(rawText, transactionToken);
      break;
    }
    case "webflow": {
      const { parseWebflowExport } = await import("./saas");
      envelope = parseWebflowExport(rawText, transactionToken);
      break;
    }
    case "hubspot": {
      const { parseHubSpotExport } = await import("./saas");
      envelope = parseHubSpotExport(rawText, transactionToken);
      break;
    }
    case "wix": {
      const { parseWixExport } = await import("./saas");
      envelope = parseWixExport(rawText, transactionToken);
      break;
    }
    case "squarespace": {
      const { parseSquarespaceExport } = await import("./saas");
      envelope = parseSquarespaceExport(rawText, transactionToken);
      break;
    }
    case "duda":
    case "tilda":
    case "builder": {
      const { parseGenericSaaS } = await import("./saas");
      envelope = parseGenericSaaS(rawText, platform, transactionToken);
      break;
    }

    // ── PHP CMS ──
    case "joomla": {
      const { parseJoomlaExport } = await import("./php-cms");
      envelope = parseJoomlaExport(rawText, transactionToken);
      break;
    }
    case "typo3": {
      const { parseTypo3Export } = await import("./php-cms");
      envelope = parseTypo3Export(rawText, transactionToken);
      break;
    }
    case "craft":
    case "statamic": {
      const { parseCraftExport } = await import("./php-cms");
      envelope = parseCraftExport(rawText, transactionToken);
      break;
    }
    case "grav": {
      const { parseGravExport } = await import("./php-cms");
      envelope = parseGravExport(rawText, transactionToken);
      break;
    }
    // Generic PHP CMS fallback (ProcessWire, Concrete, October, Bolt, ExpressionEngine, Backdrop, Contao, Silverstripe, Pimcore, Cockpit)
    case "processwire":
    case "concrete":
    case "october":
    case "bolt":
    case "expressionengine":
    case "backdrop":
    case "contao":
    case "silverstripe":
    case "pimcore":
    case "cockpit": {
      const { parseGenericPHPCMS } = await import("./php-cms");
      envelope = parseGenericPHPCMS(rawText, platform, transactionToken);
      break;
    }

    // ── Headless SaaS (Hygraph, Contentstack, Kontent.ai, DatoCMS) ──
    case "hygraph":
    case "contentstack":
    case "kontent":
    case "dato": {
      const { parseGenericSaaS } = await import("./saas");
      envelope = parseGenericSaaS(rawText, platform, transactionToken);
      break;
    }

    // ── Universal formats (CSV, Markdown, SQL, API, JSON) ──
    case "csv":
    case "spreadsheet":
    case "excel": {
      const { parseSpreadsheet } = await import("./universal");
      envelope = parseSpreadsheet(rawText, transactionToken);
      break;
    }
    case "markdown":
    case "md":
    case "mdx": {
      const { parseMarkdownFiles } = await import("./universal");
      envelope = parseMarkdownFiles([{ path: "import.md", content: rawText }], transactionToken);
      break;
    }
    case "sql":
    case "mysql":
    case "postgresql":
    case "sqlite": {
      const { parseSQLDump } = await import("./universal");
      envelope = parseSQLDump(rawText, transactionToken);
      break;
    }
    case "api":
    case "rest":
    case "graphql": {
      const { parseJSONDatabase } = await import("./universal");
      envelope = parseJSONDatabase(rawText, transactionToken, platform);
      break;
    }
    case "airtable":
    case "notion":
    case "firebase":
    case "mongodb":
    case "json": {
      const { parseJSONDatabase } = await import("./universal");
      envelope = parseJSONDatabase(rawText, transactionToken, platform);
      break;
    }

    // ── SveltyCMS native ──
    case "sveltycms": {
      const { parseJSONDatabase } = await import("./universal");
      envelope = parseJSONDatabase(rawText, transactionToken, "sveltycms");
      break;
    }

    default:
      // Last-resort: try generic JSON
      try {
        const { parseJSONDatabase } = await import("./universal");
        envelope = parseJSONDatabase(rawText, transactionToken, platform);
      } catch {
        logger.warn(`[ParserDispatcher] No parser for platform "${platform}"`);
      }
  }

  const elapsed = Date.now() - start;
  if (envelope) {
    logger.info(
      `[ParserDispatcher] ${platform}: ${envelope.entries.length} entries in ${elapsed}ms`,
    );
  } else {
    logger.warn(`[ParserDispatcher] ${platform}: parsing failed after ${elapsed}ms`);
  }

  return envelope;
}
