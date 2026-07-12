/**
 * @file src/plugins/smart-importer/parsers/ecommerce.ts
 * @description E-commerce platform parsers — Shopify, Magento, PrestaShop, OpenCart.
 */

import { nowISODateString } from "@utils/date";
import type { SNCEnvelope, SNCEntry } from "../types";
import { processEcommerceVariants } from "../index.server";

// ============================================================================
// Shopify Products JSON
// ============================================================================

export function parseShopifyExport(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const products = raw.products || (Array.isArray(raw) ? raw : []);
    const entries: SNCEntry[] = [];

    for (const product of products) {
      const variants = Array.isArray(product.variants) ? product.variants : [];
      const firstVariant = variants[0] || {};
      const id = String(product.id || "");

      entries.push({
        externalId: id,
        title: String(product.title || "Untitled Product"),
        slug: String(product.handle || ""),
        status: product.status === "active" ? "published" : "draft",
        content: String(product.body_html || product.description || ""),
        createdAt: product.created_at || nowISODateString(),
        updatedAt: product.updated_at || nowISODateString(),
        taxonomies: {
          vocabularies: ["product_type", "tags", "vendor"],
          terms: {
            product_type: [String(product.product_type || "")].filter(Boolean),
            tags:
              typeof product.tags === "string"
                ? product.tags
                    .split(",")
                    .map((t: string) => t.trim())
                    .filter(Boolean)
                : Array.isArray(product.tags)
                  ? product.tags
                  : [],
            vendor: [String(product.vendor || "")].filter(Boolean),
          },
        },
        rawCustomFields: product,
        ecommerce: {
          sku: String(firstVariant.sku || ""),
          price: parseFloat(firstVariant.price || "0"),
          compareAtPrice: firstVariant.compare_at_price
            ? parseFloat(firstVariant.compare_at_price)
            : undefined,
          inventoryQuantity: variants.reduce(
            (sum: number, v: any) => sum + (parseInt(v.inventory_quantity) || 0),
            0,
          ),
          variants: processEcommerceVariants(
            variants.map((v: any) => ({
              id: v.id,
              sku: v.sku,
              title: v.title,
              price: v.price,
              inventory_quantity: v.inventory_quantity,
              option1: v.option1,
              option2: v.option2,
              option3: v.option3,
            })),
          ),
        },
        assetsToMirror: product.image?.src
          ? [
              {
                externalUrl: product.image.src,
                originalId: id,
                fieldTarget: "featuredImage",
                altText: product.image.alt || "",
              },
            ]
          : [],
      });
    }

    return {
      sourcePlatform: "shopify",
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// Magento Product CSV/JSON
// ============================================================================

export function parseMagentoExport(jsonOrCsv: string, token: string): SNCEnvelope | null {
  try {
    let items: any[] = [];
    if (jsonOrCsv.trim().startsWith("{") || jsonOrCsv.trim().startsWith("[")) {
      const raw = JSON.parse(jsonOrCsv);
      items = raw.items || raw.products || (Array.isArray(raw) ? raw : [raw]);
    } else {
      // CSV fallback
      const lines = jsonOrCsv.trim().split("\n");
      if (lines.length < 2) return null;
      const headers = lines[0].split(",").map((h) => h.trim());
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        const obj: any = {};
        headers.forEach((h, j) => {
          obj[h] = vals[j] || "";
        });
        items.push(obj);
      }
    }

    const entries: SNCEntry[] = items.map((item: any, idx: number) => ({
      externalId: String(item.sku || item.entity_id || item.id || `magento_${idx}`),
      title: String(item.name || item.title || "Product"),
      slug: String(item.url_key || item.slug || ""),
      status: item.status === "1" || item.status === 1 ? "published" : "draft",
      content: String(item.description || item.short_description || ""),
      createdAt: item.created_at || nowISODateString(),
      updatedAt: item.updated_at || nowISODateString(),
      taxonomies: {
        vocabularies: ["categories"],
        terms: {
          categories: String(item.categories || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        },
      },
      rawCustomFields: item,
      ecommerce: {
        sku: String(item.sku || ""),
        price: parseFloat(item.price || "0"),
        inventoryQuantity: parseInt(item.qty || item.quantity || "0"),
        variants: [],
      },
      assetsToMirror:
        item.image || item.thumbnail
          ? [
              {
                externalUrl: String(item.image || item.thumbnail),
                originalId: String(item.sku || idx),
                fieldTarget: "featuredImage",
              },
            ]
          : [],
    }));

    return {
      sourcePlatform: "magento",
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// PrestaShop CSV Export
// ============================================================================

export function parsePrestaShopExport(csvText: string, token: string): SNCEnvelope | null {
  try {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) return null;
    const headers = lines[0].split(";").map((h) => h.trim());
    const entries: SNCEntry[] = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split(";").map((v) => v.trim().replace(/^"|"$/g, ""));
      if (vals.length < 2) continue;
      const obj: any = {};
      headers.forEach((h, j) => {
        obj[h] = vals[j] || "";
      });
      const id = String(obj["Product ID"] || obj.id_product || i);

      entries.push({
        externalId: id,
        title: String(obj["Name"] || obj.name || "Product"),
        slug: String(obj["URL"] || obj.link_rewrite || "")
          .toLowerCase()
          .replace(/\s+/g, "-"),
        status: obj["Active"] === "1" || obj.active === "1" ? "published" : "draft",
        content: String(obj["Description"] || obj.description || ""),
        createdAt: nowISODateString(),
        updatedAt: nowISODateString(),
        taxonomies: { vocabularies: [], terms: {} },
        rawCustomFields: obj,
        ecommerce: {
          sku: String(obj["Reference"] || obj.reference || ""),
          price: parseFloat(obj["Price"] || obj.price || "0"),
          inventoryQuantity: parseInt(obj["Quantity"] || obj.quantity || "0"),
          variants: [],
        },
        assetsToMirror: obj["Image URL"]
          ? [
              {
                externalUrl: obj["Image URL"],
                originalId: id,
                fieldTarget: "featuredImage",
              },
            ]
          : [],
      });
    }

    return {
      sourcePlatform: "prestashop",
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

// ============================================================================
// OpenCart CSV/JSON
// ============================================================================

export function parseOpenCartExport(
  jsonOrCsv: string,
  token: string,
  format: "csv" | "json" = "csv",
): SNCEnvelope | null {
  try {
    let items: any[] = [];
    if (format === "json") {
      const parsed = JSON.parse(jsonOrCsv) as
        | unknown[]
        | { products?: unknown[]; data?: unknown[] };
      items = Array.isArray(parsed) ? parsed : parsed.products || parsed.data || [];
    } else {
      const lines = jsonOrCsv.trim().split("\n");
      if (lines.length < 2) return null;
      const headers = lines[0].split(",").map((h) => h.trim());
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        const obj: any = {};
        headers.forEach((h, j) => {
          obj[h] = vals[j] || "";
        });
        items.push(obj);
      }
    }

    const entries: SNCEntry[] = items.map((item: any, idx: number) => ({
      externalId: String(item.product_id || item.id || `opencart_${idx}`),
      title: String(item.name || item.model || "Product"),
      slug: String(item.name || "")
        .toLowerCase()
        .replace(/\s+/g, "-"),
      status: item.status === "1" ? "published" : "draft",
      content: String(item.description || ""),
      createdAt: item.date_added || nowISODateString(),
      updatedAt: item.date_modified || nowISODateString(),
      taxonomies: { vocabularies: [], terms: {} },
      rawCustomFields: item,
      ecommerce: {
        sku: String(item.model || item.sku || ""),
        price: parseFloat(item.price || "0"),
        inventoryQuantity: parseInt(item.quantity || "0"),
        variants: [],
      },
      assetsToMirror: item.image
        ? [
            {
              externalUrl: String(item.image),
              originalId: String(item.product_id || idx),
              fieldTarget: "featuredImage",
            },
          ]
        : [],
    }));

    return {
      sourcePlatform: "opencart",
      version: "1.0",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}
