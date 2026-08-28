/**
 * @file src/plugins/smart-importer/parsers/ecommerce.ts
 * @description E-commerce platform parsers — Shopify, WooCommerce, Magento, PrestaShop, OpenCart.
 */

import { nowISODateString } from "@utils/date";
import type { ProductVariant, SNCEnvelope, SNCEntry } from "../types";
import { processEcommerceVariants } from "../index.server";

/** WooCommerce product meta → SNC ecommerce block (WXR postmeta or REST fields). */
export function buildWooCommerceEcommerce(
  meta: Record<string, unknown>,
  variants: ProductVariant[] = [],
): NonNullable<SNCEntry["ecommerce"]> {
  const sku = String(meta.sku ?? meta._sku ?? "");
  const regular =
    parseFloat(
      String(meta.regular_price ?? meta._regular_price ?? meta.price ?? meta._price ?? "0"),
    ) || 0;
  const saleRaw = meta.sale_price ?? meta._sale_price;
  const sale =
    saleRaw !== undefined && saleRaw !== null && String(saleRaw) !== ""
      ? parseFloat(String(saleRaw))
      : NaN;
  const price = Number.isFinite(sale) && sale > 0 ? sale : regular;
  const stock = parseInt(String(meta.stock_quantity ?? meta._stock ?? "0"), 10) || 0;
  const weightRaw = meta.weight ?? meta._weight;
  const weight =
    weightRaw !== undefined && weightRaw !== null && String(weightRaw) !== ""
      ? parseFloat(String(weightRaw))
      : undefined;

  return {
    sku,
    price,
    compareAtPrice: Number.isFinite(sale) && sale > 0 && regular > sale ? regular : undefined,
    inventoryQuantity: variants.length
      ? variants.reduce((sum, v) => sum + (v.inventoryQuantity || 0), 0)
      : stock,
    weight: Number.isFinite(weight) ? weight : undefined,
    variants,
  };
}

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
// WooCommerce — WXR (product + product_variation) or REST JSON
// ============================================================================

/**
 * WooCommerce catalog import.
 * Accepts a product-only WXR, a full WordPress WXR (filters to products),
 * or Woo REST JSON (`[{ sku, regular_price, variations }]`.
 * Variations are nested on the parent — same SNC `ecommerce` shape as Shopify.
 */
export function parseWooCommerceExport(raw: string, token: string): SNCEnvelope | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.includes("<item>") && (text.includes("wp:post_type") || text.includes("<wp:"))) {
    return parseWooWxr(text, token);
  }
  return parseWooRestJson(text, token);
}

function parseWooWxr(xmlText: string, token: string): SNCEnvelope | null {
  try {
    const attachmentUrl = new Map<string, { url: string; alt: string }>();
    const products = new Map<string, SNCEntry>();
    const variationRows: Array<{ parentId: string; variant: ProductVariant }> = [];

    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let itemMatch: RegExpExecArray | null;
    while ((itemMatch = itemRegex.exec(xmlText)) !== null) {
      const itemXml = itemMatch[1];
      const postType = wxrCData(itemXml, "wp:post_type") || "post";
      const id = wxrCData(itemXml, "wp:post_id") || wxrTag(itemXml, "guid") || "";
      if (!id) continue;

      if (postType === "attachment") {
        const url = wxrCData(itemXml, "wp:attachment_url");
        if (url) {
          attachmentUrl.set(id, {
            url,
            alt: wxrTag(itemXml, "title") || "",
          });
        }
        continue;
      }

      if (postType !== "product" && postType !== "product_variation") continue;

      const meta = wxrPostMeta(itemXml);
      const title = decodeXml(wxrTag(itemXml, "title") || "Untitled Product");

      if (postType === "product_variation") {
        const parentId = wxrCData(itemXml, "wp:post_parent") || "";
        if (!parentId || parentId === "0") continue;
        variationRows.push({
          parentId,
          variant: {
            id,
            sku: String(meta._sku ?? meta.sku ?? ""),
            title,
            price: parseFloat(String(meta._price ?? meta._regular_price ?? meta.price ?? "0")) || 0,
            inventoryQuantity: parseInt(String(meta._stock ?? meta.stock_quantity ?? "0"), 10) || 0,
            options: wooAttributeOptions(meta),
          },
        });
        continue;
      }

      const cats = wxrCategories(itemXml, "product_cat");
      const tags = wxrCategories(itemXml, "product_tag");
      const entry: SNCEntry = {
        externalId: id,
        title,
        slug: wxrCData(itemXml, "wp:post_name") || "",
        status: mapWooStatus(wxrCData(itemXml, "wp:status")),
        content: wxrEncoded(itemXml, "content:encoded"),
        excerpt: wxrEncoded(itemXml, "excerpt:encoded"),
        createdAt: wxrTag(itemXml, "wp:post_date") || nowISODateString(),
        updatedAt: wxrTag(itemXml, "wp:post_modified") || nowISODateString(),
        taxonomies: {
          vocabularies: [
            ...(cats.length ? ["product_cat"] : []),
            ...(tags.length ? ["product_tag"] : []),
          ],
          terms: {
            ...(cats.length ? { product_cat: cats } : {}),
            ...(tags.length ? { product_tag: tags } : {}),
          },
        },
        rawCustomFields: { ...meta, type: "product" },
        assetsToMirror: [],
        ecommerce: buildWooCommerceEcommerce(meta),
      };

      const thumbId = String(meta._thumbnail_id ?? meta.thumbnail_id ?? "");
      if (thumbId) entry.rawCustomFields._thumbnailId = thumbId;

      products.set(id, entry);
    }

    for (const row of variationRows) {
      const parent = products.get(row.parentId);
      if (!parent?.ecommerce) continue;
      parent.ecommerce.variants = [...(parent.ecommerce.variants || []), row.variant];
      parent.ecommerce.inventoryQuantity = parent.ecommerce.variants.reduce(
        (sum, v) => sum + (v.inventoryQuantity || 0),
        0,
      );
    }

    for (const entry of products.values()) {
      const thumbId = String(entry.rawCustomFields._thumbnailId ?? "");
      const att = thumbId ? attachmentUrl.get(thumbId) : undefined;
      if (att) {
        entry.assetsToMirror.push({
          externalUrl: att.url,
          originalId: thumbId,
          fieldTarget: "featuredImage",
          altText: att.alt,
        });
      }
    }

    const entries = [...products.values()];
    if (!entries.length) return null;

    return {
      sourcePlatform: "woocommerce",
      version: "WXR",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

function parseWooRestJson(jsonText: string, token: string): SNCEnvelope | null {
  try {
    const raw = JSON.parse(jsonText);
    const products = raw.products || (Array.isArray(raw) ? raw : raw.data || []);
    if (!Array.isArray(products) || products.length === 0) return null;

    const entries: SNCEntry[] = [];
    for (const product of products) {
      if (!product || typeof product !== "object") continue;
      const id = String(product.id ?? product.sku ?? "");
      if (!id) continue;

      const variations = Array.isArray(product.variations)
        ? product.variations.map((v: Record<string, unknown>) => ({
            id: String(v.id ?? ""),
            sku: String(v.sku ?? ""),
            title: String(v.name ?? v.title ?? "Variation"),
            price: parseFloat(String(v.price ?? v.regular_price ?? "0")) || 0,
            inventoryQuantity: parseInt(String(v.stock_quantity ?? "0"), 10) || 0,
            options: Array.isArray(v.attributes)
              ? (v.attributes as Array<{ name?: string; option?: string }>).map((a) => ({
                  name: String(a.name || "Option"),
                  value: String(a.option || ""),
                }))
              : [],
          }))
        : [];

      const images = Array.isArray(product.images) ? product.images : [];
      const firstImage = images[0] || product.image;
      const cats = Array.isArray(product.categories)
        ? product.categories.map((c: { name?: string }) => String(c.name || "")).filter(Boolean)
        : [];
      const tags = Array.isArray(product.tags)
        ? product.tags.map((t: { name?: string }) => String(t.name || "")).filter(Boolean)
        : [];

      const meta = {
        sku: product.sku,
        regular_price: product.regular_price,
        sale_price: product.sale_price,
        price: product.price,
        stock_quantity: product.stock_quantity,
        weight: product.weight,
      };

      entries.push({
        externalId: id,
        title: String(product.name || product.title || "Untitled Product"),
        slug: String(product.slug || ""),
        status: mapWooStatus(String(product.status || "publish")),
        content: String(product.description || product.short_description || ""),
        createdAt: product.date_created || nowISODateString(),
        updatedAt: product.date_modified || nowISODateString(),
        taxonomies: {
          vocabularies: [
            ...(cats.length ? ["product_cat"] : []),
            ...(tags.length ? ["product_tag"] : []),
          ],
          terms: {
            ...(cats.length ? { product_cat: cats } : {}),
            ...(tags.length ? { product_tag: tags } : {}),
          },
        },
        rawCustomFields: product,
        ecommerce: buildWooCommerceEcommerce(meta, variations),
        assetsToMirror: firstImage?.src
          ? [
              {
                externalUrl: String(firstImage.src),
                originalId: id,
                fieldTarget: "featuredImage",
                altText: String(firstImage.alt || ""),
              },
            ]
          : [],
      });
    }

    if (!entries.length) return null;
    return {
      sourcePlatform: "woocommerce",
      version: "REST",
      transactionToken: token,
      entries,
    };
  } catch {
    return null;
  }
}

function mapWooStatus(status: string | undefined): SNCEntry["status"] {
  const s = (status || "publish").toLowerCase();
  if (s === "publish" || s === "published") return "published";
  if (s === "pending") return "pending";
  if (s === "trash" || s === "archived") return "archived";
  return "draft";
}

function wooAttributeOptions(meta: Record<string, unknown>): ProductVariant["options"] {
  const options: ProductVariant["options"] = [];
  for (const [key, value] of Object.entries(meta)) {
    if (!key.startsWith("attribute_") || value == null || value === "") continue;
    options.push({
      name: key.replace(/^attribute_(pa_)?/, ""),
      value: String(value),
    });
  }
  return options.length ? options : [{ name: "Option", value: "Default" }];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
}

function wxrTag(xml: string, tag: string): string {
  const safe = escapeRegExp(tag);
  const re = new RegExp(`<${safe}(?:\\s[^>]*)?>([\\s\\S]*?)</${safe}>`);
  const m = xml.match(re);
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim() : "";
}

function wxrCData(xml: string, tag: string): string {
  return wxrTag(xml, tag);
}

function wxrEncoded(xml: string, tag: string): string {
  return decodeXml(wxrTag(xml, tag));
}

function wxrPostMeta(itemXml: string): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  const re = /<wp:postmeta>([\s\S]*?)<\/wp:postmeta>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(itemXml)) !== null) {
    const key = wxrCData(m[1], "wp:meta_key");
    const value = wxrCData(m[1], "wp:meta_value");
    if (!key) continue;
    meta[key] = value;
    if (key.startsWith("_")) meta[key.slice(1)] = value;
  }
  return meta;
}

function wxrCategories(itemXml: string, domain: string): string[] {
  const names: string[] = [];
  const re = new RegExp(
    `<category[^>]*domain="${escapeRegExp(domain)}"[^>]*>([\\s\\S]*?)</category>`,
    "g",
  );
  let m: RegExpExecArray | null;
  while ((m = re.exec(itemXml)) !== null) {
    const name = m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim();
    if (name) names.push(decodeXml(name));
  }
  return names;
}

function decodeXml(value: string): string {
  // codeql[js/double-escaping]: intentional — unescape `&amp;` LAST so nested
  // `&amp;lt;` decodes to `&lt;` (single pass), never to `<`.
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, "&");
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
